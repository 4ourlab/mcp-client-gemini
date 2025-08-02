import { MCPClient } from '../src/index.js';

async function main() {
    var systemPrompt = `
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
        "gemini-model-name",
        "./examples/mcpServer.json",
        systemPrompt
    );

    try {
        await mcpClient.connectToServers();
        const response = await mcpClient.processQuery("What’s the weather in Sacramento?");
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