#!/usr/bin/env node
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import { spawnPromise } from "spawn-rx";
const server = new Server({
    name: "napier",
    version: "0.1",
}, {
    capabilities: {
        tools: {},
    },
});
server.setRequestHandler(ListToolsRequestSchema, () => __awaiter(void 0, void 0, void 0, function* () {
    return {
        tools: [
            {
                name: "install_repo_mcp_server",
                description: "Install an MCP server via npx or uvx",
                inputSchema: {
                    type: "object",
                    properties: {
                        name: {
                            type: "string",
                            description: "The package name of the MCP server",
                        },
                        args: {
                            type: "array",
                            items: { type: "string" },
                            description: "The arguments to pass along",
                        },
                        env: {
                            type: "array",
                            items: { type: "string" },
                            description: "The environment variables to set, delimited by =",
                        },
                    },
                    required: ["name"],
                },
            },
            {
                name: "install_local_mcp_server",
                description: "Install an MCP server whose code is cloned locally on your computer",
                inputSchema: {
                    type: "object",
                    properties: {
                        path: {
                            type: "string",
                            description: "The path to the MCP server code cloned on your computer",
                        },
                        args: {
                            type: "array",
                            items: { type: "string" },
                            description: "The arguments to pass along",
                        },
                        env: {
                            type: "array",
                            items: { type: "string" },
                            description: "The environment variables to set, delimited by =",
                        },
                    },
                    required: ["path"],
                },
            },
        ],
    };
}));
function hasNodeJs() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield spawnPromise("node", ["--version"]);
            return true;
        }
        catch (e) {
            return false;
        }
    });
}
function hasUvx() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield spawnPromise("uvx", ["--version"]);
            return true;
        }
        catch (e) {
            return false;
        }
    });
}
function isNpmPackage(name) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield spawnPromise("npm", ["view", name, "version"]);
            return true;
        }
        catch (e) {
            return false;
        }
    });
}
function installToClaudeDesktop(name, cmd, args, env) {
    var _a;
    const configPath = process.platform === "win32"
        ? path.join(os.homedir(), "AppData", "Roaming", "Claude", "claude_desktop_config.json")
        : path.join(os.homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
    let config;
    try {
        config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    }
    catch (e) {
        config = {};
    }
    const envObj = (env !== null && env !== void 0 ? env : []).reduce((acc, val) => {
        const [key, value] = val.split("=");
        acc[key] = value;
        return acc;
    }, {});
    const newServer = Object.assign({ command: cmd, args: args }, (env ? { env: envObj } : {}));
    const mcpServers = (_a = config.mcpServers) !== null && _a !== void 0 ? _a : {};
    mcpServers[name] = newServer;
    config.mcpServers = mcpServers;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}
function installRepoWithArgsToClaudeDesktop(name, npmIfTrueElseUvx, args, env) {
    // If the name is in a scoped package, we need to remove the scope
    const serverName = /^@.*\//i.test(name) ? name.split("/")[1] : name;
    installToClaudeDesktop(serverName, npmIfTrueElseUvx ? "npx" : "uvx", [name, ...(args !== null && args !== void 0 ? args : [])], env);
}
function attemptNodeInstall(directory) {
    return __awaiter(this, void 0, void 0, function* () {
        yield spawnPromise("npm", ["install"], { cwd: directory });
        // Run down package.json looking for bins
        const pkg = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf-8"));
        if (pkg.bin) {
            return Object.keys(pkg.bin).reduce((acc, key) => {
                acc[key] = path.resolve(directory, pkg.bin[key]);
                return acc;
            }, {});
        }
        if (pkg.main) {
            return { [pkg.name]: path.resolve(directory, pkg.main) };
        }
        return {};
    });
}
function installLocalMcpServer(dirPath, args, env) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!fs.existsSync(dirPath)) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Path ${dirPath} does not exist locally!`,
                    },
                ],
                isError: true,
            };
        }
        if (fs.existsSync(path.join(dirPath, "package.json"))) {
            const servers = yield attemptNodeInstall(dirPath);
            Object.keys(servers).forEach((name) => {
                installToClaudeDesktop(name, "node", [servers[name], ...(args !== null && args !== void 0 ? args : [])], env);
            });
            return {
                content: [
                    {
                        type: "text",
                        text: `Installed the following servers via npm successfully! ${Object.keys(servers).join(";")} Tell the user to restart the app`,
                    },
                ],
            };
        }
        return {
            content: [
                {
                    type: "text",
                    text: `Can't figure out how to install ${dirPath}`,
                },
            ],
            isError: true,
        };
    });
}
function installRepoMcpServer(name, args, env) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!(yield hasNodeJs())) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Node.js is not installed, please install it!`,
                    },
                ],
                isError: true,
            };
        }
        if (yield isNpmPackage(name)) {
            installRepoWithArgsToClaudeDesktop(name, true, args, env);
            return {
                content: [
                    {
                        type: "text",
                        text: "Installed MCP server via npx successfully! Tell the user to restart the app",
                    },
                ],
            };
        }
        if (!(yield hasUvx())) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Python uv is not installed, please install it! Tell users to go to https://docs.astral.sh/uv`,
                    },
                ],
                isError: true,
            };
        }
        installRepoWithArgsToClaudeDesktop(name, false, args, env);
        return {
            content: [
                {
                    type: "text",
                    text: "Installed MCP server via uvx successfully! Tell the user to restart the app",
                },
            ],
        };
    });
}
server.setRequestHandler(CallToolRequestSchema, (request) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (request.params.name === "install_repo_mcp_server") {
            const { name, args, env } = request.params.arguments;
            return yield installRepoMcpServer(name, args, env);
        }
        if (request.params.name === "install_local_mcp_server") {
            const dirPath = request.params.arguments.path;
            const { args, env } = request.params.arguments;
            return yield installLocalMcpServer(dirPath, args, env);
        }
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
    catch (err) {
        return {
            content: [
                {
                    type: "text",
                    text: `Error setting up package: ${err}`,
                },
            ],
            isError: true,
        };
    }
}));
function runServer() {
    return __awaiter(this, void 0, void 0, function* () {
        const transport = new StdioServerTransport();
        yield server.connect(transport);
    });
}
runServer().catch(console.error);
