import type {
  ConversationStore,
  ConversationSummary,
} from "../../conversations/conversation-store.js";

export type ChatCommandDescriptor = {
  readonly name: string;
  readonly aliases: readonly string[];
  readonly description: string;
  readonly usage: string;
};

export type ChatCommandRuntimeContext = {
  readonly conversationStore: ConversationStore;
  readonly activeConversation: ConversationSummary;
  writeLine(message: string): void;
};

export type ChatCommandContext = ChatCommandRuntimeContext & {
  readonly availableCommands: readonly ChatCommandDescriptor[];
};

export type ChatCommandResult =
  | {
      type: "handled";
    }
  | {
      type: "activate-conversation";
      conversation: ConversationSummary;
    }
  | {
      type: "exit";
    };

export type ChatCommandDispatchResult =
  | {
      type: "not-command";
    }
  | {
      type: "unknown-command";
      name: string;
    }
  | ChatCommandResult;

export interface ChatCommand extends ChatCommandDescriptor {
  execute(
    argumentsText: string,
    context: ChatCommandContext,
  ): Promise<ChatCommandResult>;
}
