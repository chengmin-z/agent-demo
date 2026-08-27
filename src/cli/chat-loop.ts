import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";

import type {
  AgentEngine,
  AgentRunResult,
  AgentRunEvent,
} from "../agent/agent-engine.js";
import type { ConversationStore } from "../conversations/conversation-store.js";
import { ChatCommandRegistry } from "./commands/chat-command-registry.js";
import { createBuiltInChatCommands } from "./commands/built-in-chat-commands.js";
import { getOrCreateDefaultConversation } from "./default-conversation.js";

type TerminalAgentEventRenderer = {
  handle(event: AgentRunEvent): void;
  finish(): void;
};

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
  const commandRegistry = new ChatCommandRegistry(createBuiltInChatCommands());

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

      try {
        const commandResult = await commandRegistry.dispatch(prompt, {
          conversationStore,
          activeConversation,
          writeLine: (message) => console.log(message),
        });

        switch (commandResult.type) {
          case "not-command":
            break;

          case "unknown-command": {
            const name =
              commandResult.name.length > 0 ? `/${commandResult.name}` : "/";

            console.log(`[error] unknown command: ${name}; use /help`);
            continue;
          }

          case "handled":
            continue;

          case "activate-conversation":
            activeConversation = commandResult.conversation;
            continue;

          case "exit":
            return;
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[error] command failed: ${message}`);
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
