import type { KimiAssistantMessage, KimiChatMessage } from "./kimi-types.js";
import type { ToolDefinition } from "../tools/tool.js";

export type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type ModelCompletion = {
  message: KimiAssistantMessage;
  usage: TokenUsage | undefined;
};

export type ModelFinishReason =
  "stop" | "length" | "tool_calls" | "content_filter" | "function_call";

export type ModelStreamEvent =
  | {
      type: "text-delta";
      delta: string;
    }
  | {
      type: "reasoning-delta";
      delta: string;
    }
  | {
      type: "tool-call-delta";
      index: number;
      id: string | undefined;
      toolType: "function" | undefined;
      nameDelta: string | undefined;
      argumentsDelta: string | undefined;
    }
  | {
      type: "message-finish";
      finishReason: ModelFinishReason;
    }
  | {
      type: "usage";
      usage: TokenUsage;
    };

export interface ModelGateway {
  complete(
    messages: readonly KimiChatMessage[],
    tools: readonly ToolDefinition[],
    signal: AbortSignal,
  ): Promise<ModelCompletion>;

  streamMessage(
    messages: readonly KimiChatMessage[],
    tools: readonly ToolDefinition[],
    signal: AbortSignal,
  ): AsyncIterable<ModelStreamEvent>;
}
