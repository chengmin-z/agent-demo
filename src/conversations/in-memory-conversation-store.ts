import type { KimiChatMessage } from "../llm/kimi-types.js";
import type {
  ConversationId,
  ConversationSummary,
  ConversationStore,
} from "./conversation-store.js";

type InMemoryConversation = {
  summary: ConversationSummary;
  messages: readonly KimiChatMessage[];
};

export class InMemoryConversationStore implements ConversationStore {
  private readonly conversations = new Map<
    ConversationId,
    InMemoryConversation
  >();

  async create(
    conversationId: ConversationId,
    title: string,
  ): Promise<ConversationSummary> {
    if (this.conversations.has(conversationId)) {
      throw new Error(`Conversation already exists: ${conversationId}`);
    }

    const now = new Date().toISOString();

    const summary: ConversationSummary = {
      id: conversationId,
      title,
      createdAt: now,
      updatedAt: now,
    };

    this.conversations.set(conversationId, {
      summary,
      messages: [],
    });

    return { ...summary };
  }

  async list(): Promise<readonly ConversationSummary[]> {
    return [...this.conversations.values()]
      .map(({ summary }) => ({ ...summary }))
      .sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) ||
          left.id.localeCompare(right.id),
      );
  }

  async get(
    conversationId: ConversationId,
  ): Promise<ConversationSummary | undefined> {
    const conversation = this.conversations.get(conversationId);

    return conversation === undefined ? undefined : { ...conversation.summary };
  }

  async load(
    conversationId: ConversationId,
  ): Promise<readonly KimiChatMessage[]> {
    const entry = this.conversations.get(conversationId);
    return [...(entry?.messages ?? [])];
  }

  async save(
    conversationId: ConversationId,
    messages: readonly KimiChatMessage[],
  ): Promise<void> {
    const now = new Date().toISOString();
    const existing = this.conversations.get(conversationId);

    if (existing === undefined) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    this.conversations.set(conversationId, {
      summary: {
        ...existing.summary,
        updatedAt: now,
      },
      messages: [...messages],
    });
  }

  async rename(
    conversationId: ConversationId,
    title: string,
  ): Promise<ConversationSummary | undefined> {
    const existing = this.conversations.get(conversationId);

    if (existing === undefined) {
      return undefined;
    }

    const summary: ConversationSummary = {
      ...existing.summary,
      title,
      updatedAt: new Date().toISOString(),
    };

    this.conversations.set(conversationId, {
      ...existing,
      summary,
    });

    return { ...summary };
  }

  async delete(conversationId: ConversationId): Promise<boolean> {
    return this.conversations.delete(conversationId);
  }

  async clear(conversationId: ConversationId): Promise<void> {
    const existing = this.conversations.get(conversationId);

    if (existing === undefined) {
      return;
    }

    this.conversations.set(conversationId, {
      summary: {
        ...existing.summary,
        updatedAt: new Date().toISOString(),
      },
      messages: [],
    });
  }
}
