import { deepEqual, equal, throws } from "node:assert/strict";
import { test } from "node:test";

import { ChatCommandRegistry } from "../../src/cli/commands/chat-command-registry.js";
import type {
  ChatCommand,
  ChatCommandRuntimeContext,
} from "../../src/cli/commands/chat-command.js";
import { InMemoryConversationStore } from "../../src/conversations/in-memory-conversation-store.js";

const runtimeContext: ChatCommandRuntimeContext = {
  conversationStore: new InMemoryConversationStore(),
  activeConversation: {
    id: "default",
    title: "Default",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  writeLine() {},
};

function createCommand(
  name: string,
  aliases: readonly string[] = [],
): ChatCommand {
  return {
    name,
    aliases,
    description: `Test command ${name}`,
    usage: `/${name}`,
    async execute() {
      return { type: "handled" };
    },
  };
}

test("ordinary text is not treated as a command", async () => {
  const registry = new ChatCommandRegistry();

  deepEqual(await registry.dispatch("hello /use default", runtimeContext), {
    type: "not-command",
  });
});

test("unknown slash command is consumed", async () => {
  const registry = new ChatCommandRegistry();

  deepEqual(await registry.dispatch("/missing", runtimeContext), {
    type: "unknown-command",
    name: "missing",
  });
});

test("dispatch parses arguments and resolves aliases", async () => {
  let receivedArguments: string | undefined;
  const command: ChatCommand = {
    name: "use",
    aliases: ["switch"],
    description: "Switch conversation",
    usage: "/use <conversation-id>",
    async execute(argumentsText) {
      receivedArguments = argumentsText;
      return { type: "exit" };
    },
  };
  const registry = new ChatCommandRegistry([command]);

  const result = await registry.dispatch(
    "/SWITCH\t  default  ",
    runtimeContext,
  );

  equal(receivedArguments, "default");
  deepEqual(result, { type: "exit" });
});

test("registration rejects duplicate names and aliases", () => {
  throws(
    () => new ChatCommandRegistry([createCommand("one", ["one"])]),
    /Duplicate command name or alias/,
  );

  throws(
    () =>
      new ChatCommandRegistry([
        createCommand("one", ["first"]),
        createCommand("two", ["first"]),
      ]),
    /already registered/,
  );
});

test("list returns canonical commands without duplicating aliases", () => {
  const registry = new ChatCommandRegistry([createCommand("exit", ["quit"])]);

  deepEqual(registry.list(), [
    {
      name: "exit",
      aliases: ["quit"],
      description: "Test command exit",
      usage: "/exit",
    },
  ]);
});
