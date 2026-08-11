import type { KimiChatMessage } from "../llm/kimi-types.js";

export interface ContextBuilder {
  build(messages: readonly KimiChatMessage[]): readonly KimiChatMessage[];
}
