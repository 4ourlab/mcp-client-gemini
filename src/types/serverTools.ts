export interface Tool {
    name: string;
    description: string;
    input_schema: any;
    serverName?: string;
}

export interface ServerConfig {
    command: string;
    args: string[];
}

export interface MCPConfig {
    mcpServers: {
        [serverName: string]: ServerConfig;
    };
}

export interface MCPConnection {
    serverName: string;
    transport: any;
    client: any;
    tools: Tool[];
}