import type { KimiChatMessage } from "../llm/kimi-types.js";

export interface ConversationStore {
  load(): Promise<readonly KimiChatMessage[]>;

  save(messages: readonly KimiChatMessage[]): Promise<void>;

  clear(): Promise<void>;
}
