import type { KimiChatMessage } from "../llm/kimi-types.js";
import type { ContextBuilder } from "./context-builder.js";

export class FullHistoryContextBuilder implements ContextBuilder {
  build(messages: readonly KimiChatMessage[]): readonly KimiChatMessage[] {
    return [...messages];
  }
}
