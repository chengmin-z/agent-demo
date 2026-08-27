import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { randomUUID } from "node:crypto";

import type {
  AgentEngine,
  AgentRunResult,
  AgentRunEvent,
} from "../agent/agent-engine.js";
import type {
  ConversationStore,
  ConversationSummary,
} from "../conversations/conversation-store.js";

type TerminalAgentEventRenderer = {
  handle(event: AgentRunEvent): void;
  finish(): void;
};

const DEFAULT_CONVERSATION_ID = "default";
const DEFAULT_CONVERSATION_TITLE = "Default";

async function getOrCreateDefaultConversation(
  conversationStore: ConversationStore,
): Promise<ConversationSummary> {
  const conversations = await conversationStore.list();

  const existing = conversations.find(
    (conversation) => conversation.id === DEFAULT_CONVERSATION_ID,
  );

  if (existing !== undefined) {
    return existing;
  }

  return conversationStore.create(
    DEFAULT_CONVERSATION_ID,
    DEFAULT_CONVERSATION_TITLE,
  );
}

function createTerminalAgentEventRenderer(): TerminalAgentEventRenderer {
  let assistantLineOpen = false;

  function closeAssistantLine(): void {
    if (assistantLineOpen) {
      output.write("\n");
      assistantLineOpen = false;
    }
  }

  return {
    handle(event): void {
      switch (event.type) {
        case "turn-start":
          closeAssistantLine();
          output.write(
            `[context:start] ${event.contextStats.selectedMessages}/` +
              `${event.contextStats.totalMessages} messages, ` +
              `~${event.contextStats.estimatedTokens} tokens\n`,
          );
          break;

        case "assistant-text-delta":
          if (!assistantLineOpen) {
            output.write("Agent> ");
            assistantLineOpen = true;
          }

          output.write(event.delta);
          break;

        case "tool-start":
          closeAssistantLine();
          output.write(`[tool] ${event.toolName} started\n`);
          break;

        case "tool-finish": {
          closeAssistantLine();
          const status = event.isError ? "failed" : "succeeded";
          output.write(`[tool] ${event.toolName} ${status}\n`);
          break;
        }

        case "model-usage":
          closeAssistantLine();
          output.write(
            `[usage:step ${event.step}] ` +
              `input=${event.usage.promptTokens}, ` +
              `output=${event.usage.completionTokens}, ` +
              `total=${event.usage.totalTokens}\n`,
          );
          break;
      }
    },

    finish(): void {
      closeAssistantLine();
    },
  };
}

function writeTurnSummary(result: AgentRunResult): void {
  const firstDelta =
    result.timing.timeToFirstDeltaMs === undefined
      ? "unavailable"
      : `${Math.round(result.timing.timeToFirstDeltaMs)}ms`;

  const firstText =
    result.timing.timeToFirstTextMs === undefined
      ? "unavailable"
      : `${Math.round(result.timing.timeToFirstTextMs)}ms`;

  const usage =
    result.usage === undefined
      ? "usage=unavailable"
      : `input=${result.usage.promptTokens}, ` +
        `output=${result.usage.completionTokens}, ` +
        `total=${result.usage.totalTokens}`;

  output.write(
    `[turn] steps=${result.steps}, ` +
      `tools=${result.toolExecutions.length}, ` +
      `${usage}, ` +
      `first_delta=${firstDelta}, ` +
      `first_text=${firstText}, ` +
      `duration=${Math.round(result.timing.durationMs)}ms\n`,
  );
}

export async function runChatLoop(
  agentEngine: AgentEngine,
  conversationStore: ConversationStore,
): Promise<void> {
  const readline = createInterface({ input, output });

  try {
    let activeConversation =
      await getOrCreateDefaultConversation(conversationStore);
    while (true) {
      const prompt = (
        await readline.question(`[${activeConversation.title}] You> `)
      ).trim();
      if (prompt.length === 0) {
        continue;
      }

      if (prompt === "/sessions") {
        const conversations = await conversationStore.list();
        for (const conversation of conversations) {
          const marker = conversation.id === activeConversation.id ? "*" : " ";
          console.log(`${marker} ${conversation.title} (${conversation.id})`);
        }
        continue;
      }

      if (prompt === "/use" || prompt.startsWith("/use ")) {
        const conversationId = prompt.slice("/use".length).trim();

        if (conversationId.length === 0) {
          console.log("[info] usage: /use <conversation-id>");
          continue;
        }

        const conversation = await conversationStore.get(conversationId);

        if (conversation === undefined) {
          console.log(`[error] conversation not found: ${conversationId}`);
          continue;
        }

        activeConversation = conversation;

        console.log(
          `[info] switched to conversation: ` +
            `${activeConversation.title} (${activeConversation.id})`,
        );

        continue;
      }

      if (prompt === "/new" || prompt.startsWith("/new ")) {
        const requestedTitle = prompt.slice("/new".length).trim();

        const title =
          requestedTitle.length > 0 ? requestedTitle : "New conversation";

        activeConversation = await conversationStore.create(
          randomUUID(),
          title,
        );

        console.log(
          `[info] created conversation: ` +
            `${activeConversation.title} (${activeConversation.id})`,
        );

        continue;
      }

      if (prompt === "/rename" || prompt.startsWith("/rename ")) {
        const title = prompt.slice("/rename".length).trim();

        if (title.length === 0) {
          console.log("[info] usage: /rename <new-title>");
          continue;
        }

        const renamed = await conversationStore.rename(
          activeConversation.id,
          title,
        );

        if (renamed === undefined) {
          console.log(
            `[error] conversation not found: ${activeConversation.id}`,
          );
          continue;
        }

        activeConversation = renamed;

        console.log(`[info] conversation renamed to: ${renamed.title}`);
        continue;
      }

      if (prompt === "/delete" || prompt.startsWith("/delete ")) {
        const conversationId = prompt.slice("/delete".length).trim();

        if (conversationId.length === 0) {
          console.log("[info] usage: /delete <conversation-id>");
          continue;
        }

        if (conversationId === DEFAULT_CONVERSATION_ID) {
          console.log(
            "[error] default conversation cannot be deleted; use /clear",
          );
          continue;
        }

        const conversation = await conversationStore.get(conversationId);

        if (conversation === undefined) {
          console.log(`[error] conversation not found: ${conversationId}`);
          continue;
        }

        const deletingActiveConversation =
          conversationId === activeConversation.id;

        const fallbackConversation = deletingActiveConversation
          ? await getOrCreateDefaultConversation(conversationStore)
          : undefined;

        const deleted = await conversationStore.delete(conversationId);

        if (!deleted) {
          console.log(`[error] conversation not found: ${conversationId}`);
          continue;
        }

        if (fallbackConversation !== undefined) {
          activeConversation = fallbackConversation;
        }

        console.log(
          `[info] deleted conversation: ${conversation.title} (${conversation.id})`,
        );

        continue;
      }

      if (prompt === "/exit" || prompt === "/quit") {
        break;
      }

      if (prompt === "/clear") {
        await conversationStore.clear(activeConversation.id);
        console.log("[info] conversation cleared");
        continue;
      }

      const abortController = new AbortController();

      try {
        const history = await conversationStore.load(activeConversation.id);
        const renderer = createTerminalAgentEventRenderer();

        let result: AgentRunResult;
        try {
          result = await agentEngine.runStreamingTurn(
            history,
            prompt,
            renderer.handle,
            abortController.signal,
          );
          await conversationStore.save(activeConversation.id, result.messages);
        } finally {
          renderer.finish();
        }

        writeTurnSummary(result);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[error] ${message}`);
      }
    }
  } finally {
    readline.close();
  }
}
