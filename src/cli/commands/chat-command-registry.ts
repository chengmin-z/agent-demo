import type {
  ChatCommand,
  ChatCommandDescriptor,
  ChatCommandDispatchResult,
  ChatCommandRuntimeContext,
} from "./chat-command.js";

type ParsedCommand = {
  name: string;
  argumentsText: string;
};

function normalizeCommandName(name: string): string {
  const normalized = name.trim().toLowerCase();

  if (
    normalized.length === 0 ||
    normalized.startsWith("/") ||
    /\s/u.test(normalized)
  ) {
    throw new Error(`Invalid command name: ${JSON.stringify(name)}`);
  }

  return normalized;
}

function parseCommand(input: string): ParsedCommand | undefined {
  const trimmed = input.trim();

  if (!trimmed.startsWith("/")) {
    return undefined;
  }

  const commandText = trimmed.slice(1);
  const separatorIndex = commandText.search(/\s/u);

  if (separatorIndex === -1) {
    return {
      name: commandText.toLowerCase(),
      argumentsText: "",
    };
  }

  return {
    name: commandText.slice(0, separatorIndex).toLowerCase(),
    argumentsText: commandText.slice(separatorIndex).trim(),
  };
}

export class ChatCommandRegistry {
  private readonly commandsByName = new Map<string, ChatCommand>();
  private readonly registeredCommands: ChatCommand[] = [];

  constructor(commands: readonly ChatCommand[] = []) {
    for (const command of commands) {
      this.register(command);
    }
  }

  register(command: ChatCommand): void {
    const normalizedNames = [command.name, ...command.aliases].map(
      normalizeCommandName,
    );
    const namesInCommand = new Set<string>();

    for (const name of normalizedNames) {
      if (namesInCommand.has(name)) {
        throw new Error(`Duplicate command name or alias: /${name}`);
      }

      namesInCommand.add(name);

      if (this.commandsByName.has(name)) {
        throw new Error(`Command name or alias already registered: /${name}`);
      }
    }

    this.registeredCommands.push(command);

    for (const name of normalizedNames) {
      this.commandsByName.set(name, command);
    }
  }

  list(): readonly ChatCommandDescriptor[] {
    return this.registeredCommands.map((command) => ({
      name: command.name,
      aliases: [...command.aliases],
      description: command.description,
      usage: command.usage,
    }));
  }

  async dispatch(
    input: string,
    context: ChatCommandRuntimeContext,
  ): Promise<ChatCommandDispatchResult> {
    const parsed = parseCommand(input);

    if (parsed === undefined) {
      return { type: "not-command" };
    }

    const command = this.commandsByName.get(parsed.name);

    if (command === undefined) {
      return {
        type: "unknown-command",
        name: parsed.name,
      };
    }

    return command.execute(parsed.argumentsText, {
      ...context,
      availableCommands: this.list(),
    });
  }
}
