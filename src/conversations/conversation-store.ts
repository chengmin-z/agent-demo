import type { KimiChatMessage } from "../llm/kimi-types.js";

export type ConversationId = string;

export type ConversationSummary = {
  id: ConversationId;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export interface ConversationStore {
  create(
    conversationId: ConversationId,
    title: string,
  ): Promise<ConversationSummary>;

  list(): Promise<readonly ConversationSummary[]>;

  get(conversationId: ConversationId): Promise<ConversationSummary | undefined>;

  load(conversationId: ConversationId): Promise<readonly KimiChatMessage[]>;

  save(
    conversationId: ConversationId,
    messages: readonly KimiChatMessage[],
  ): Promise<void>;

  rename(
    conversationId: ConversationId,
    title: string,
  ): Promise<ConversationSummary | undefined>;

  delete(conversationId: ConversationId): Promise<boolean>;

  clear(conversationId: ConversationId): Promise<void>;
}
