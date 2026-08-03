import { homedir, platform } from "node:os";
import { join } from "node:path";

export function defaultConversationDatabasePath(): string {
  const home = homedir();

  switch (platform()) {
    case "darwin":
      return join(
        home,
        "Library",
        "Application Support",
        "k3-local-agent",
        "conversations.sqlite3",
      );
    case "win32":
      return join(
        home,
        "AppData",
        "Local",
        "k3-local-agent",
        "conversations.sqlite3",
      );
    default:
      return join(
        process.env.XDG_DATA_HOME ?? join(home, ".local", "share"),
        "k3-local-agent",
        "conversations.sqlite3",
      );
  }
}
