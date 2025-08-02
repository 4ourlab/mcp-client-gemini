# @4ourlab/mcp-client-gemini

A MCP (Model Context Protocol) implementation for Gemini models that allows connecting and using multiple MCP servers through Google Generative AI API.

This implementation is based on the official [Model Context Protocol documentation](https://modelcontextprotocol.io/).

## Features

- 🔗 Connect to multiple MCP servers
- 🤖 Integration with Google Generative AI (Gemini)
- 📝 Support for custom system prompts
- 🔧 Complete TypeScript interface
- 🛠️ Included usage examples

## Supported Models

This client has been tested with the following Gemini models:
- `gemini-1.5-pro`
- `gemini-2.5-pro`
- `gemini-2.5-flash`
- `gemini-2.5-flash-lite`

## Installation

```bash
npm install @4ourlab/mcp-client-gemini
```

## Basic Usage

```javascript
import { MCPClient } from '@4ourlab/mcp-client-gemini';

const mcpClient = new MCPClient(
    "your-gemini-api-key",
    "gemini-1.5-pro", // or any other supported model
    "./path/to/mcpServer.json",
    "Optional system prompt"
);

try {
    await mcpClient.connectToServers();
    const response = await mcpClient.processQuery("Your query here");
    console.log(response);
} finally {
    await mcpClient.cleanup();
}
```

## MCP Server Configuration

Create an `mcpServer.json` file with your server configuration:

```json
{
    "mcpServers": {
        "weather": {
            "command": "node",
            "args": ["/path/to/mcpserver-weather/build/index.js"]
        },
        "mssql": {
            "command": "dotnet",
            "args": ["run", "--project", "/path/to/mcpserver-mssql.csproj"]
        }
    }
}
```

## Examples

### Example 1: Interactive Chat

```javascript
import { MCPClient } from '@4ourlab/mcp-client-gemini';

async function main() {
    const mcpClient = new MCPClient(
        "your-api-key",
        "gemini-1.5-pro",
        "./examples/mcpServer.json",
        ""
    );

    try {
        await mcpClient.connectToServers();
        await mcpClient.chatLoop();
    } finally {
        await mcpClient.cleanup();
        process.exit(0);
    }
}

main().catch(console.error);
```

### Example 2: Query Processing with JSON Response

```javascript
import { MCPClient } from '@4ourlab/mcp-client-gemini';

async function main() {
    const systemPrompt = `
        You are an intelligent assistant with access to tools. Use your knowledge and available tools to solve problems proactively. 

        For final responses, use JSON format:
        {
            "header": {
                "success": true|false,
                "usedTools": true|false,
                "message": "error description when success=false"
            },
            "result": {
                "your response content here"
            }
        }`;

    const mcpClient = new MCPClient(
        "your-api-key",
        "gemini-2.5-flash",
        "./examples/mcpServer.json",
        systemPrompt
    );

    try {
        await mcpClient.connectToServers();
        const response = await mcpClient.processQuery("What's the weather in Sacramento?");
        console.log("\nResponse:\n" + cleanResponse(response));
    } catch (error) {
        console.error("Error in main:", error);
    } finally {
        await mcpClient.cleanup();
        process.exit(0);
    }
}

function cleanResponse(response) {
    const content = response;
    const json = content.match(/```json\n([\s\S]*?)\n```/)?.[1] || content.match(/\{[\s\S]*\}/)?.[0];
    return json || response;
}

main().catch(console.error);
```

## API

### MCPClient

#### Constructor
```javascript
new MCPClient(apiKey: string, model: string, serverConfigPath: string, systemPrompt?: string)
```

#### Methods

- `connectToServers()`: Connect to all configured MCP servers
- `processQuery(query: string)`: Process a query using available servers
- `chatLoop()`: Start an interactive chat loop
- `cleanup()`: Clean up connections and resources

## Dependencies

- `@google/generative-ai`: Official Google Generative AI client
- `@modelcontextprotocol/sdk`: Official MCP SDK

## License

MIT 