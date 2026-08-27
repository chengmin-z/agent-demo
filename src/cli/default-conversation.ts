import type {
  ConversationStore,
  ConversationSummary,
} from "../conversations/conversation-store.js";

export const DEFAULT_CONVERSATION_ID = "default";
export const DEFAULT_CONVERSATION_TITLE = "Default";

export async function getOrCreateDefaultConversation(
  conversationStore: ConversationStore,
): Promise<ConversationSummary> {
  const existing = await conversationStore.get(DEFAULT_CONVERSATION_ID);

  if (existing !== undefined) {
    return existing;
  }

  return conversationStore.create(
    DEFAULT_CONVERSATION_ID,
    DEFAULT_CONVERSATION_TITLE,
  );
}
