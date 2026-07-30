import type { KimiAssistantMessage, KimiChatMessage } from "./kimi-types.js";
import type { ToolDefinition } from "../tools/tool.js";

export interface ModelGateway {
  complete(
    messages: readonly KimiChatMessage[],
    tools: readonly ToolDefinition[],
    signal: AbortSignal,
  ): Promise<KimiAssistantMessage>;
}
