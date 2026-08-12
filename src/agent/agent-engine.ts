import { performance } from "node:perf_hooks";
import type {
  KimiAssistantMessage,
  KimiChatMessage,
  KimiToolMessage,
  KimiFunctionToolCall,
  KimiUserMessage,
} from "../llm/kimi-types.js";
import type { ModelGateway, TokenUsage } from "../llm/model-gateway.js";
import type { ToolRegistry } from "../tools/tool-registry.js";
import type { ToolResult } from "../tools/tool.js";
import type { ContextBuilder } from "../context/context-builder.js";
import { estimateContextTokens } from "../context/estimate-context-tokens.js";
import { StreamingAssistantMessageAssembler } from "../llm/streaming-assistant-message-assembler.js";

export type AgentRunTiming = {
  timeToFirstDeltaMs: number | undefined;
  timeToFirstTextMs: number | undefined;
  durationMs: number;
};

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
  usage: TokenUsage | undefined;
  timing: AgentRunTiming;
};

export type AgentRunEvent =
  | {
      type: "turn-start";
      contextStats: AgentContextStats;
    }
  | {
      type: "assistant-text-delta";
      step: number;
      delta: string;
    }
  | {
      type: "tool-start";
      step: number;
      toolCallId: string;
      toolName: string;
    }
  | {
      type: "tool-finish";
      step: number;
      toolCallId: string;
      toolName: string;
      isError: boolean;
    }
  | {
      type: "model-usage";
      step: number;
      usage: TokenUsage;
    };

export type AgentRunEventHandler = (
  event: AgentRunEvent,
) => void | Promise<void>;

type PreparedTurn = {
  persistentMessages: KimiChatMessage[];
  contextMessages: KimiChatMessage[];
  contextStats: AgentContextStats;
};

function createErrorResult(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);

  return {
    content: JSON.stringify({ error: message }),
    isError: true,
  };
}

function createEmptyTokenUsage(): TokenUsage {
  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };
}

function addTokenUsage(current: TokenUsage, next: TokenUsage): TokenUsage {
  return {
    promptTokens: current.promptTokens + next.promptTokens,
    completionTokens: current.completionTokens + next.completionTokens,
    totalTokens: current.totalTokens + next.totalTokens,
  };
}

function createRunTiming(
  startedAt: number,
  firstDeltaAt: number | undefined,
  firstTextAt: number | undefined,
): AgentRunTiming {
  return {
    timeToFirstDeltaMs:
      firstDeltaAt === undefined ? undefined : firstDeltaAt - startedAt,
    timeToFirstTextMs:
      firstTextAt === undefined ? undefined : firstTextAt - startedAt,
    durationMs: performance.now() - startedAt,
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
    const startedAt = performance.now();
    const { persistentMessages, contextMessages, contextStats } =
      this.prepareTurn(history, prompt);
    const toolExecutions: AgentToolExecution[] = [];

    let totalUsage = createEmptyTokenUsage();
    let allUsageAvailable = true;
    for (let step = 1; step <= this.maxSteps; step++) {
      signal.throwIfAborted();

      const completion = await this.modelGateway.complete(
        contextMessages,
        this.toolRegistry.definitions,
        signal,
      );

      if (completion.usage === undefined) {
        allUsageAvailable = false;
      } else {
        totalUsage = addTokenUsage(totalUsage, completion.usage);
      }

      const assistantMessage = completion.message;

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
          usage: allUsageAvailable ? totalUsage : undefined,
          timing: createRunTiming(startedAt, undefined, undefined),
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

  async runStreamingTurn(
    history: readonly KimiChatMessage[],
    prompt: string,
    onEvent: AgentRunEventHandler,
    signal: AbortSignal,
  ): Promise<AgentRunResult> {
    const startedAt = performance.now();
    let firstDeltaAt: number | undefined;
    let firstTextAt: number | undefined;
    const { persistentMessages, contextMessages, contextStats } =
      this.prepareTurn(history, prompt);

    await onEvent({
      type: "turn-start",
      contextStats,
    });

    let totalUsage = createEmptyTokenUsage();
    let allUsageAvailable = true;

    const toolExecutions: AgentToolExecution[] = [];
    const toolDefinitions = this.toolRegistry.definitions;

    for (let step = 1; step <= this.maxSteps; step++) {
      signal.throwIfAborted();

      const assembler = new StreamingAssistantMessageAssembler();
      let stepUsage: TokenUsage | undefined;

      for await (const event of this.modelGateway.streamMessage(
        contextMessages,
        toolDefinitions,
        signal,
      )) {
        signal.throwIfAborted();

        if (
          event.type === "reasoning-delta" ||
          event.type === "text-delta" ||
          event.type === "tool-call-delta"
        ) {
          firstDeltaAt ??= performance.now();
        }

        if (event.type === "usage") {
          stepUsage = event.usage;

          await onEvent({
            type: "model-usage",
            step,
            usage: event.usage,
          });

          continue;
        }

        assembler.add(event);

        if (event.type === "text-delta") {
          firstTextAt ??= performance.now();

          await onEvent({
            type: "assistant-text-delta",
            step,
            delta: event.delta,
          });
        }
      }

      if (stepUsage === undefined) {
        allUsageAvailable = false;
      } else {
        totalUsage = addTokenUsage(totalUsage, stepUsage);
      }

      const assistantMessage = assembler.finish();

      contextMessages.push(assistantMessage);
      persistentMessages.push(assistantMessage);

      const toolCalls = assistantMessage.tool_calls ?? [];

      if (toolCalls.length === 0) {
        return {
          finalMessage: assistantMessage,
          messages: [...persistentMessages],
          toolExecutions: [...toolExecutions],
          contextStats,
          steps: step,
          usage: allUsageAvailable ? totalUsage : undefined,
          timing: createRunTiming(startedAt, firstDeltaAt, firstTextAt),
        };
      }

      for (const toolCall of toolCalls) {
        signal.throwIfAborted();

        await onEvent({
          type: "tool-start",
          step,
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
        });

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

        await onEvent({
          type: "tool-finish",
          step,
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          isError: result.isError,
        });
      }
    }

    throw new Error(`Agent exceeded maximum steps (${this.maxSteps})`);
  }

  private prepareTurn(
    history: readonly KimiChatMessage[],
    prompt: string,
  ): PreparedTurn {
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

    return {
      persistentMessages,
      contextMessages,
      contextStats,
    };
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
