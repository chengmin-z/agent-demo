import type {
  KimiAssistantMessage,
  KimiChatMessage,
  KimiToolMessage,
  KimiFunctionToolCall,
  KimiUserMessage,
} from "../llm/kimi-types.js";
import type { ModelGateway } from "../llm/model-gateway.js";
import type { ToolRegistry } from "../tools/tool-registry.js";
import type { ToolResult } from "../tools/tool.js";
import type { ContextBuilder } from "../context/context-builder.js";
import { estimateContextTokens } from "../context/estimate-context-tokens.js";

export type AgentContextStats = {
  totalMessages: number;
  selectedMessages: number;
  estimatedTokens: number;
};

export type AgentToolExecution = {
  toolCallId: string;
  toolName: string;
  result: ToolResult;
};

export type AgentRunResult = {
  finalMessage: KimiAssistantMessage;
  messages: readonly KimiChatMessage[];
  toolExecutions: readonly AgentToolExecution[];
  contextStats: AgentContextStats;
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
    private readonly contextBuilder: ContextBuilder,
    private readonly systemPrompt: string,
    private readonly maxSteps: number,
  ) {
    if (!Number.isInteger(maxSteps) || maxSteps < 1) {
      throw new Error("maxSteps must be a positive integer");
    }
  }

  async runTurn(
    history: readonly KimiChatMessage[],
    prompt: string,
    signal: AbortSignal,
  ): Promise<AgentRunResult> {
    // Build the persistent messages for this turn, starting with the system prompt if this is the first turn
    let persistentMessages: KimiChatMessage[];
    const userMessage: KimiUserMessage = {
      role: "user",
      content: prompt,
    };
    if (history.length === 0) {
      persistentMessages = [
        {
          role: "system",
          content: this.systemPrompt,
        },
        userMessage,
      ];
    } else {
      if (history[0]?.role !== "system") {
        throw new Error("the first message must be system message");
      }
      persistentMessages = [...history];
      persistentMessages.push(userMessage);
    }

    const contextMessages = [...this.contextBuilder.build(persistentMessages)];

    const contextStats: AgentContextStats = {
      totalMessages: persistentMessages.length,
      selectedMessages: contextMessages.length,
      estimatedTokens: estimateContextTokens(contextMessages),
    };

    const toolExecutions: AgentToolExecution[] = [];

    for (let step = 1; step <= this.maxSteps; step++) {
      signal.throwIfAborted();

      const assistantMessage = await this.modelGateway.complete(
        contextMessages,
        this.toolRegistry.definitions,
        signal,
      );

      contextMessages.push(assistantMessage);
      persistentMessages.push(assistantMessage);

      const toolCalls = assistantMessage.tool_calls ?? [];

      if (toolCalls.length === 0) {
        return {
          finalMessage: assistantMessage,
          messages: [...persistentMessages],
          toolExecutions: [...toolExecutions],
          contextStats: contextStats,
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

        const toolMessage: KimiToolMessage = {
          role: "tool",
          tool_call_id: toolCall.id,
          content: result.content,
        };

        contextMessages.push(toolMessage);
        persistentMessages.push(toolMessage);
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
