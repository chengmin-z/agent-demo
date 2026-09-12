# k3-local-agent

A safe local TypeScript agent powered by [Kimi K3](https://platform.moonshot.cn/), running as an interactive chat in your terminal.

The agent can read files and list directories inside the workspace it was started from (enforced by a file-access policy), remember multiple conversations in a local SQLite database, and stream responses with live token-usage and timing stats.

## Features

- Interactive terminal chat loop with streaming output
- Multi-step agent loop with tool calling (bounded by `MAX_AGENT_STEPS`)
- Built-in tools: `read_file`, `list_files` (workspace-scoped), and `add_numbers`
- Multiple named conversations with persistence in SQLite
- Context management: recent-turns window with estimated token budget
- Per-turn stats: steps, tool calls, token usage, time-to-first-token, duration

## Requirements

- Node.js 24.x (see `.nvmrc`)
- pnpm 10 (see the `packageManager` field in `package.json`)
- A Moonshot API key for the Kimi API

## Getting started

```sh
pnpm install
cp .env.example .env
# edit .env and set MOONSHOT_API_KEY
pnpm dev
```

You'll land in an interactive prompt:

```
[Default conversation] You>
```

Type a message to chat, or use one of the slash commands below.

## Slash commands

| Command                | Description                              |
| ---------------------- | ---------------------------------------- |
| `/help`                | List available commands                  |
| `/sessions`            | List conversations                       |
| `/use <id>`            | Switch to an existing conversation       |
| `/new [title]`         | Create and switch to a new conversation  |
| `/rename <new-title>`  | Rename the active conversation           |
| `/delete <id>`         | Delete a conversation by ID              |
| `/clear`               | Clear messages in the active conversation|
| `/exit` (or `/quit`)   | Exit the chat                            |

Conversations are stored in a platform-specific data directory (e.g. `~/Library/Application Support/k3-local-agent/conversations.sqlite3` on macOS).

## Configuration

All settings come from environment variables (see `.env.example`):

| Variable                        | Default                        | Description                              |
| ------------------------------- | ------------------------------ | ---------------------------------------- |
| `MOONSHOT_API_KEY`              | — (required)                   | Your Kimi API key                        |
| `KIMI_BASE_URL`                 | `https://api.moonshot.cn/v1`   | API base URL                             |
| `KIMI_MODEL`                    | `kimi-k3`                      | Model name                               |
| `KIMI_REASONING_EFFORT`         | `low`                          | `low`, `high`, or `max`                  |
| `KIMI_MAX_TOKENS`               | `16000`                        | Max tokens per completion                |
| `MAX_AGENT_STEPS`               | `12`                           | Max model/tool steps per turn            |
| `MAX_CONTEXT_TURNS`             | `4`                            | Recent turns kept in context             |
| `MAX_CONTEXT_ESTIMATED_TOKENS`  | `12000`                        | Estimated context token budget           |

## Development

```sh
pnpm dev            # run the agent with tsx
pnpm test           # run tests (node --test)
pnpm typecheck      # type-check src and test
pnpm build          # compile to dist/
pnpm start          # run the compiled build
pnpm format         # format with Prettier
pnpm format:check   # check formatting
```

## Project structure

```
src/
  agent/          agent engine and system prompt
  cli/            terminal chat loop and slash commands
  context/        context window builders and token estimation
  conversations/  conversation stores (SQLite, in-memory)
  llm/            Kimi client, model gateway, streaming assembler
  tools/          tool registry and built-in tools
  workspace/      workspace-scoped file access policy
  config.ts       environment config (zod-validated)
  main.ts         entry point
```

## License

[MIT](LICENSE)
