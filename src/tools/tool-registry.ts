import type { AgentTool, ToolDefinition, ToolResult } from "./tool.js";

function createErrorResult(message: string): ToolResult {
  return {
    content: JSON.stringify({ error: message }),
    isError: true,
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export class ToolRegistry {
  private readonly toolsByName = new Map<string, AgentTool>();

  constructor(tools: readonly AgentTool[]) {
    for (const tool of tools) {
      if (this.toolsByName.has(tool.name)) {
        throw new Error(`Duplicate tool name: ${tool.name}`);
      }
      this.toolsByName.set(tool.name, tool);
    }
  }

  get definitions(): readonly ToolDefinition[] {
    return Array.from(this.toolsByName.values(), (tool) => tool.definition);
  }

  async execute(
    name: string,
    rawInput: unknown,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    const tool = this.toolsByName.get(name);
    if (!tool) {
      return createErrorResult(`Unknown tool: ${name}`);
    }
    try {
      return await tool.execute(rawInput, signal);
    } catch (error: unknown) {
      return createErrorResult(getErrorMessage(error));
    }
  }
}
