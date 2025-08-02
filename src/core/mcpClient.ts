import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import readline from "readline/promises";
import fs from "fs";
import path from "path";
import { MCPConfig, Tool, MCPConnection, ServerConfig } from "../types/serverTools.js";

const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8"));

export class MCPClient {
    private mcpConnections: MCPConnection[] = [];
    private genAI: GoogleGenerativeAI;
    private model: string;
    private serverConfigPath: string;
    private systemPrompt: string;

    constructor(apiKey: string, model: string, serverConfigPath: string, systemPrompt: string = "") {
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = model;
        this.serverConfigPath = serverConfigPath;
        this.systemPrompt = systemPrompt;
    }

    async connectToServers() {
        /**
         * Connect to multiple MCP servers using configuration from mcpserver.json
         */
        try {
            const config = await this.loadServerConfig();
            const serverEntries = Object.entries(config.mcpServers);

            // Connect to all servers in parallel
            const connectionPromises = serverEntries.map(async ([serverName, serverConfig]) => {
                try {
                    return await this.getConnectionServer(serverName, serverConfig);
                } catch (error) {
                    throw new Error(`Failed to connect to server ${serverName}: ${error}`);
                }
            });

            const connections = await Promise.all(connectionPromises);

            // Filter out failed connections
            this.mcpConnections = connections.filter((conn): conn is MCPConnection => conn !== null);

            if (this.mcpConnections.length === 0) {
                throw new Error("Failed to connect to any MCP servers");
            }
        } catch (error) {
            throw new Error(`Failed to connect to MCP servers: ${error}`);
        }
    }

    private async loadServerConfig(): Promise<MCPConfig> {
        /**
         * Load and parse the MCP server configuration file
         */
        const configPath = path.join(process.cwd(), this.serverConfigPath);
        if (!fs.existsSync(configPath)) {
            throw new Error(`${this.serverConfigPath} not found in current directory`);
        }

        const configContent = fs.readFileSync(configPath, "utf-8");
        const config: MCPConfig = JSON.parse(configContent);

        if (!config.mcpServers || Object.keys(config.mcpServers).length === 0) {
            throw new Error(`No server configuration found in ${this.serverConfigPath}`);
        }

        return config;
    }

    private async getConnectionServer(serverName: string, serverConfig: ServerConfig): Promise<MCPConnection> {
        /**
         * Connect to a single MCP server and return connection details
         */

        const transport = new StdioClientTransport({
            command: serverConfig.command,
            args: serverConfig.args,
        });

        const client = new Client({ name: packageJson.name, version: packageJson.version });
        client.connect(transport);

        // List available tools for this server
        const toolsResult = await client.listTools();
        const tools: Tool[] = toolsResult.tools.map((tool: any) => {
            return {
                name: tool.name,
                description: tool.description || "",
                input_schema: tool.inputSchema,
                serverName: serverName,
            };
        });

        return {
            serverName,
            transport,
            client,
            tools,
        };
    }

    async processQuery(query: string) {
        /**
         * Process a query using Gemini and available tools
         *
         * @param query - The user's input query
         * @returns Processed response as a string
         */
        try {
            const model = this.genAI.getGenerativeModel({ model: this.model });

            // Get all tools from all connected servers
            const allTools = this.getAllTools();

            // Convert tools to Gemini format and clean the schema
            const functionDeclarations = allTools.map((tool: Tool) => {
                // Clean the schema to remove unsupported fields
                const cleanSchema = { ...tool.input_schema };
                delete cleanSchema.$schema;
                delete cleanSchema.additionalProperties;

                return {
                    name: tool.name,
                    description: tool.description,
                    parameters: cleanSchema
                };
            });

            const geminiTools = [{
                functionDeclarations: functionDeclarations
            }];

            // Prepare conversation contents
            const contents = [];

            // Add the user query
            contents.push({ role: "user", parts: [{ text: query }] });

            // Initial Gemini API call
            const result = await model.generateContent({
                contents: contents,
                tools: geminiTools,
                systemInstruction: this.systemPrompt || undefined,
            });

            const response = result.response;
            const finalText: string[] = [];

            // Process response and handle tool calls
            if (response.candidates && response.candidates.length > 0) {
                const candidate = response.candidates[0];
                if (candidate.content && candidate.content.parts) {
                    for (const part of candidate.content.parts) {
                        if (part.text) {
                            finalText.push(part.text);
                        } else if (part.functionCall) {
                            // Execute tool call
                            const toolName = part.functionCall.name;
                            const toolArgs = part.functionCall.args as { [x: string]: unknown };

                            try {
                                // Find which server contains this tool
                                const serverConnection = this.findToolServer(toolName);
                                if (!serverConnection) {
                                    throw new Error(`Tool ${toolName} not found in any connected server`);
                                }

                                const result = await serverConnection.client.callTool({
                                    name: toolName,
                                    arguments: toolArgs,
                                });

                                // Continue conversation with tool results
                                const toolResult = result.content;
                                const followUpContents = [
                                    { role: "user", parts: [{ text: query }] },
                                    { role: "model", parts: [{ text: `Tool result: ${toolResult}` }] }
                                ];

                                const followUpResult = await model.generateContent({
                                    contents: followUpContents,
                                    systemInstruction: this.systemPrompt || undefined,
                                });

                                const followUpResponse = followUpResult.response;
                                if (followUpResponse.candidates && followUpResponse.candidates.length > 0) {
                                    const candidate = followUpResponse.candidates[0];
                                    if (candidate.content && candidate.content.parts) {
                                        for (const part of candidate.content.parts) {
                                            if (part.text) {
                                                finalText.push(part.text);
                                            }
                                        }
                                    }
                                } else {
                                    // If no response from follow-up, use the tool result directly
                                    finalText.push(`Tool result: ${toolResult}`);
                                }
                            } catch (toolError) {
                                throw new Error(`Error executing tool ${toolName}: ${toolError}`);
                            }
                        }
                    }
                }
            } else {
                finalText.push("No response received from Gemini");
            }

            // Ensure we always have a response
            if (finalText.length === 0) {
                finalText.push("The request could not be processed. Please try rephrasing your question.");
            }

            return finalText.join("\n");
        } catch (error) {
            throw new Error(`Error processing query: ${error}`);
        }
    }

    private getAllTools(): Tool[] {
        /**
         * Get all tools from all connected servers
         */
        return this.mcpConnections.flatMap(connection => connection.tools);
    }

    private findToolServer(toolName: string): MCPConnection | null {
        /**
         * Find which server contains a specific tool
         */
        return this.mcpConnections.find(connection =>
            connection.tools.some(tool => tool.name === toolName)
        ) || null;
    }

    async chatLoop() {
        /**
         * Run an interactive chat loop
         * Type 'quit' to exit the loop
         */
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        console.log("\nChat started!\nType your queries or 'quit' to exit.");

        try {
            while (true) {
                const message = await rl.question("\nQuery: ");
                if (message.toLowerCase() === "quit") {
                    break;
                }
                const response = await this.processQuery(message);
                console.log("\nResponse:\n" + response);
            }
        } catch (error) {
            console.error("Error in chatLoop:", error);
        } finally {
            rl.close();
        }
    }

    async cleanup() {
        /**
         * Clean up resources for all connected servers
         */

        const cleanupPromises = this.mcpConnections.map(async (connection) => {
            try {
                await connection.client.close();
            } catch (error) {
                throw new Error(`Error closing connection to server ${connection.serverName}: ${error}`);
            }
        });

        await Promise.all(cleanupPromises);
    }
}