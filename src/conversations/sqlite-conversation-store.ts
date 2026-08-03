import { chmod, mkdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { dirname } from "node:path";

import type { KimiChatMessage } from "../llm/kimi-types.js";
import type { ConversationStore } from "./conversation-store.js";

type ConversationRow = {
  messages_json?: unknown;
};

export class SqliteConversationStore implements ConversationStore {
  private constructor(private readonly db: DatabaseSync) {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversation_state (
        id TEXT PRIMARY KEY CHECK (id = 'default'),
        schema_version INTEGER NOT NULL,
        messages_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
    `);
  }

  static async open(databasePath: string): Promise<SqliteConversationStore> {
    await mkdir(dirname(databasePath), {
      recursive: true,
      mode: 0o700,
    });
    const db = new DatabaseSync(databasePath, {
      timeout: 5000,
    });

    await chmod(databasePath, 0o600);
    return new SqliteConversationStore(db);
  }

  async load(): Promise<readonly KimiChatMessage[]> {
    const row = this.db
      .prepare("SELECT messages_json FROM conversation_state WHERE id = ?")
      .get("default") as ConversationRow | undefined;

    if (row === undefined) {
      return [];
    }

    if (typeof row.messages_json !== "string") {
      throw new Error("Invalid messages_json in database");
    }

    const parsed = JSON.parse(row.messages_json);

    if (!Array.isArray(parsed)) {
      throw new Error("Invalid messages_json in database");
    }

    return parsed as KimiChatMessage[];
  }

  async save(messages: readonly KimiChatMessage[]): Promise<void> {
    const messagesJson = JSON.stringify(messages);

    if (messagesJson === undefined) {
      throw new Error("Failed to serialize messages");
    }

    this.db
      .prepare(
        `
        INSERT INTO conversation_state (
          id,
          schema_version,
          messages_json,
          updated_at
        )
        VALUES(?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          schema_version = excluded.schema_version,
          messages_json = excluded.messages_json,
          updated_at = excluded.updated_at
      `,
      )
      .run("default", 1, messagesJson, new Date().toISOString());
  }

  async clear(): Promise<void> {
    this.db
      .prepare("DELETE FROM conversation_state WHERE id = ?")
      .run("default");
  }

  close(): void {
    if (this.db.isOpen) {
      this.db.close();
    }
  }
}
