import type {
  KimiAssistantMessage,
  KimiChatMessage,
  KimiFunctionToolCall,
} from "../llm/kimi-types.js";
import type { ModelGateway } from "../llm/model-gateway.js";
import type { ToolRegistry } from "../tools/tool-registry.js";
import type { ToolResult } from "../tools/tool.js";

export type AgentToolExecution = {
  toolCallId: string;
  toolName: string;
  result: ToolResult;
};

export type AgentRunResult = {
  finalMessage: KimiAssistantMessage;
  messages: readonly KimiChatMessage[];
  toolExecutions: readonly AgentToolExecution[];
  steps: number;
};

function createErrorResult(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);

  return {
    content: JSON.stringify({ error: message }),
    isError: true,
  };
}

export class AgentEngine {
  constructor(
    private readonly modelGateway: ModelGateway,
    private readonly toolRegistry: ToolRegistry,
    private readonly systemPrompt: string,
    private readonly maxSteps: number,
  ) {
    if (!Number.isInteger(maxSteps) || maxSteps < 1) {
      throw new Error("maxSteps must be a positive integer");
    }
  }

  async run(prompt: string, signal: AbortSignal): Promise<AgentRunResult> {
    const messages: KimiChatMessage[] = [
      {
        role: "system",
        content: this.systemPrompt,
      },
      {
        role: "user",
        content: prompt,
      },
    ];

    const toolExecutions: AgentToolExecution[] = [];

    for (let step = 1; step <= this.maxSteps; step++) {
      signal.throwIfAborted();

      const assistantMessage = await this.modelGateway.complete(
        messages,
        this.toolRegistry.definitions,
        signal,
      );

      messages.push(assistantMessage);

      const toolCalls = assistantMessage.tool_calls ?? [];

      if (toolCalls.length === 0) {
        return {
          finalMessage: assistantMessage,
          messages: [...messages],
          toolExecutions: [...toolExecutions],
          steps: step,
        };
      }

      for (const toolCall of toolCalls) {
        signal.throwIfAborted();
        const result = await this.executeToolCall(toolCall, signal);

        toolExecutions.push({
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          result,
        });

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result.content,
        });
      }
    }

    throw new Error(`Agent exceeded maximum steps (${this.maxSteps})`);
  }

  private async executeToolCall(
    toolCall: KimiFunctionToolCall,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    try {
      const rawInput: unknown = JSON.parse(toolCall.function.arguments);
      return await this.toolRegistry.execute(
        toolCall.function.name,
        rawInput,
        signal,
      );
    } catch (error: unknown) {
      return createErrorResult(error);
    }
  }
}
