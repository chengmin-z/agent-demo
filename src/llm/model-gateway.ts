import type { KimiAssistantMessage, KimiChatMessage } from "./kimi-types.js";
import type { ToolDefinition } from "../tools/tool.js";

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
    };

export interface ModelGateway {
  complete(
    messages: readonly KimiChatMessage[],
    tools: readonly ToolDefinition[],
    signal: AbortSignal,
  ): Promise<KimiAssistantMessage>;

  streamMessage(
    messages: readonly KimiChatMessage[],
    tools: readonly ToolDefinition[],
    signal: AbortSignal,
  ): AsyncIterable<ModelStreamEvent>;
}
