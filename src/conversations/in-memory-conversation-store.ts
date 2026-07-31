import type { KimiChatMessage } from "../llm/kimi-types.js";
import type { ConversationStore } from "./conversation-store.js";

export class InMemoryConversationStore implements ConversationStore {
  private messages: readonly KimiChatMessage[] = [];

  async load(): Promise<readonly KimiChatMessage[]> {
    return [...this.messages];
  }

  async save(messages: readonly KimiChatMessage[]): Promise<void> {
    this.messages = [...messages];
  }

  async clear(): Promise<void> {
    this.messages = [];
  }
}
