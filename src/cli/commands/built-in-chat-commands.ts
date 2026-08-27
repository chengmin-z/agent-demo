import { randomUUID } from "node:crypto";

import {
  DEFAULT_CONVERSATION_ID,
  getOrCreateDefaultConversation,
} from "../default-conversation.js";
import type { ChatCommand, ChatCommandContext } from "./chat-command.js";

function rejectUnexpectedArguments(
  argumentsText: string,
  usage: string,
  context: ChatCommandContext,
): boolean {
  if (argumentsText.length === 0) {
    return false;
  }

  context.writeLine(`[info] usage: ${usage}`);
  return true;
}

export function createBuiltInChatCommands(): readonly ChatCommand[] {
  return [
    {
      name: "help",
      aliases: [],
      description: "List available commands",
      usage: "/help",
      async execute(argumentsText, context) {
        if (rejectUnexpectedArguments(argumentsText, "/help", context)) {
          return { type: "handled" };
        }

        context.writeLine("Available commands:");

        for (const command of context.availableCommands) {
          const aliases = command.aliases
            .map((alias) => `/${alias}`)
            .join(", ");
          const aliasesText =
            aliases.length > 0 ? ` (aliases: ${aliases})` : "";

          context.writeLine(
            `  ${command.usage}${aliasesText} - ${command.description}`,
          );
        }

        return { type: "handled" };
      },
    },
    {
      name: "sessions",
      aliases: [],
      description: "List conversations",
      usage: "/sessions",
      async execute(argumentsText, context) {
        if (rejectUnexpectedArguments(argumentsText, "/sessions", context)) {
          return { type: "handled" };
        }

        const conversations = await context.conversationStore.list();

        for (const conversation of conversations) {
          const marker =
            conversation.id === context.activeConversation.id ? "*" : " ";

          context.writeLine(
            `${marker} ${conversation.title} (${conversation.id})`,
          );
        }

        return { type: "handled" };
      },
    },
    {
      name: "use",
      aliases: [],
      description: "Switch to an existing conversation",
      usage: "/use <conversation-id>",
      async execute(argumentsText, context) {
        if (argumentsText.length === 0) {
          context.writeLine("[info] usage: /use <conversation-id>");
          return { type: "handled" };
        }

        const conversation = await context.conversationStore.get(argumentsText);

        if (conversation === undefined) {
          context.writeLine(`[error] conversation not found: ${argumentsText}`);
          return { type: "handled" };
        }

        context.writeLine(
          `[info] switched to conversation: ` +
            `${conversation.title} (${conversation.id})`,
        );

        return {
          type: "activate-conversation",
          conversation,
        };
      },
    },
    {
      name: "new",
      aliases: [],
      description: "Create and switch to a new conversation",
      usage: "/new [title]",
      async execute(argumentsText, context) {
        const title =
          argumentsText.length > 0 ? argumentsText : "New conversation";
        const conversation = await context.conversationStore.create(
          randomUUID(),
          title,
        );

        context.writeLine(
          `[info] created conversation: ` +
            `${conversation.title} (${conversation.id})`,
        );

        return {
          type: "activate-conversation",
          conversation,
        };
      },
    },
    {
      name: "rename",
      aliases: [],
      description: "Rename the active conversation",
      usage: "/rename <new-title>",
      async execute(argumentsText, context) {
        if (argumentsText.length === 0) {
          context.writeLine("[info] usage: /rename <new-title>");
          return { type: "handled" };
        }

        const renamed = await context.conversationStore.rename(
          context.activeConversation.id,
          argumentsText,
        );

        if (renamed === undefined) {
          context.writeLine(
            `[error] conversation not found: ${context.activeConversation.id}`,
          );
          return { type: "handled" };
        }

        context.writeLine(`[info] conversation renamed to: ${renamed.title}`);

        return {
          type: "activate-conversation",
          conversation: renamed,
        };
      },
    },
    {
      name: "delete",
      aliases: [],
      description: "Delete a conversation by ID",
      usage: "/delete <conversation-id>",
      async execute(argumentsText, context) {
        if (argumentsText.length === 0) {
          context.writeLine("[info] usage: /delete <conversation-id>");
          return { type: "handled" };
        }

        if (argumentsText === DEFAULT_CONVERSATION_ID) {
          context.writeLine(
            "[error] default conversation cannot be deleted; use /clear",
          );
          return { type: "handled" };
        }

        const conversation = await context.conversationStore.get(argumentsText);

        if (conversation === undefined) {
          context.writeLine(`[error] conversation not found: ${argumentsText}`);
          return { type: "handled" };
        }

        const deletingActiveConversation =
          conversation.id === context.activeConversation.id;
        const fallbackConversation = deletingActiveConversation
          ? await getOrCreateDefaultConversation(context.conversationStore)
          : undefined;
        const deleted = await context.conversationStore.delete(conversation.id);

        if (!deleted) {
          context.writeLine(
            `[error] conversation not found: ${conversation.id}`,
          );
          return { type: "handled" };
        }

        context.writeLine(
          `[info] deleted conversation: ` +
            `${conversation.title} (${conversation.id})`,
        );

        if (fallbackConversation === undefined) {
          return { type: "handled" };
        }

        return {
          type: "activate-conversation",
          conversation: fallbackConversation,
        };
      },
    },
    {
      name: "clear",
      aliases: [],
      description: "Clear messages in the active conversation",
      usage: "/clear",
      async execute(argumentsText, context) {
        if (rejectUnexpectedArguments(argumentsText, "/clear", context)) {
          return { type: "handled" };
        }

        await context.conversationStore.clear(context.activeConversation.id);
        context.writeLine("[info] conversation cleared");

        return { type: "handled" };
      },
    },
    {
      name: "exit",
      aliases: ["quit"],
      description: "Exit the chat",
      usage: "/exit",
      async execute(argumentsText, context) {
        if (rejectUnexpectedArguments(argumentsText, "/exit", context)) {
          return { type: "handled" };
        }

        return { type: "exit" };
      },
    },
  ];
}
