import { equal, ok } from "node:assert/strict";
import { test } from "node:test";

import { createBuiltInChatCommands } from "../../src/cli/commands/built-in-chat-commands.js";
import { ChatCommandRegistry } from "../../src/cli/commands/chat-command-registry.js";
import type { ChatCommandDispatchResult } from "../../src/cli/commands/chat-command.js";
import { getOrCreateDefaultConversation } from "../../src/cli/default-conversation.js";
import { InMemoryConversationStore } from "../../src/conversations/in-memory-conversation-store.js";

async function createHarness() {
  const conversationStore = new InMemoryConversationStore();
  const registry = new ChatCommandRegistry(createBuiltInChatCommands());
  const lines: string[] = [];
  let activeConversation =
    await getOrCreateDefaultConversation(conversationStore);

  return {
    conversationStore,
    lines,
    get activeConversation() {
      return activeConversation;
    },
    async dispatch(input: string): Promise<ChatCommandDispatchResult> {
      const result = await registry.dispatch(input, {
        conversationStore,
        activeConversation,
        writeLine: (line) => lines.push(line),
      });

      if (result.type === "activate-conversation") {
        activeConversation = result.conversation;
      }

      return result;
    },
  };
}

test("help is generated from registered command metadata", async () => {
  const harness = await createHarness();

  equal((await harness.dispatch("/help")).type, "handled");
  ok(harness.lines.includes("Available commands:"));
  ok(harness.lines.some((line) => line.includes("/delete <conversation-id>")));
  ok(harness.lines.some((line) => line.includes("aliases: /quit")));
});

test("conversation commands return explicit active conversation changes", async () => {
  const harness = await createHarness();

  equal((await harness.dispatch("/new Work")).type, "activate-conversation");
  const workId = harness.activeConversation.id;
  equal(harness.activeConversation.title, "Work");

  equal(
    (await harness.dispatch("/rename 下周分享")).type,
    "activate-conversation",
  );
  equal(harness.activeConversation.title, "下周分享");

  equal(
    (await harness.dispatch(`/delete ${workId}`)).type,
    "activate-conversation",
  );
  equal(harness.activeConversation.id, "default");
  equal(await harness.conversationStore.get(workId), undefined);
});

test("quit alias exits and default conversation remains protected", async () => {
  const harness = await createHarness();

  equal((await harness.dispatch("/delete default")).type, "handled");
  ok((await harness.conversationStore.get("default")) !== undefined);
  equal((await harness.dispatch("/quit")).type, "exit");
});
