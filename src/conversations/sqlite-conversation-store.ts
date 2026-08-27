import { chmod, mkdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { dirname } from "node:path";

import type { KimiChatMessage } from "../llm/kimi-types.js";
import type {
  ConversationId,
  ConversationStore,
  ConversationSummary,
} from "./conversation-store.js";

type ConversationRow = {
  messages_json?: unknown;
};

type DatabaseVersionRow = {
  user_version?: unknown;
};

type ConversationSummaryRow = {
  id?: unknown;
  title?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

function parseConversationSummaryRow(
  row: ConversationSummaryRow,
): ConversationSummary {
  if (
    typeof row.id !== "string" ||
    typeof row.title !== "string" ||
    typeof row.created_at !== "string" ||
    typeof row.updated_at !== "string"
  ) {
    throw new Error("Invalid conversation summary in database");
  }

  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SqliteConversationStore implements ConversationStore {
  private constructor(private readonly db: DatabaseSync) {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        messages_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
    `);
    this.migrateLegacyConversationState();
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

  async create(
    conversationId: ConversationId,
    title: string,
  ): Promise<ConversationSummary> {
    const now = new Date().toISOString();

    this.db
      .prepare(
        `
        INSERT INTO conversations (
          id,
          title,
          schema_version,
          messages_json,
          created_at,
          updated_at
        )
        VALUES(?, ?, ?, ?, ?, ?)
        `,
      )
      .run(conversationId, title, 1, "[]", now, now);

    return {
      id: conversationId,
      title,
      createdAt: now,
      updatedAt: now,
    };
  }

  async list(): Promise<readonly ConversationSummary[]> {
    const rows = this.db
      .prepare(
        `
        SELECT id, title, created_at, updated_at
        FROM conversations
        ORDER BY updated_at DESC, id ASC
        `,
      )
      .all() as ConversationSummaryRow[];

    return rows.map(parseConversationSummaryRow);
  }

  async get(
    conversationId: ConversationId,
  ): Promise<ConversationSummary | undefined> {
    const row = this.db
      .prepare(
        `
        SELECT id, title, created_at, updated_at
        FROM conversations
        WHERE id = ?
        `,
      )
      .get(conversationId) as ConversationSummaryRow | undefined;

    return row === undefined ? undefined : parseConversationSummaryRow(row);
  }

  async load(
    conversationId: ConversationId,
  ): Promise<readonly KimiChatMessage[]> {
    const row = this.db
      .prepare("SELECT messages_json FROM conversations WHERE id = ?")
      .get(conversationId) as ConversationRow | undefined;

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

  async save(
    conversationId: ConversationId,
    messages: readonly KimiChatMessage[],
  ): Promise<void> {
    const messagesJson = JSON.stringify(messages);

    if (messagesJson === undefined) {
      throw new Error("Failed to serialize messages");
    }

    const now = new Date().toISOString();

    const result = this.db
      .prepare(
        `
        UPDATE conversations
        SET schema_version = ?, messages_json = ?, updated_at = ?
         WHERE id = ?
        `,
      )
      .run(1, messagesJson, now, conversationId);

    if (Number(result.changes) === 0) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }
  }

  async rename(
    conversationId: ConversationId,
    title: string,
  ): Promise<ConversationSummary | undefined> {
    const result = this.db
      .prepare(
        `
        UPDATE conversations
        SET title = ?, updated_at = ?
        WHERE id = ?
        `,
      )
      .run(title, new Date().toISOString(), conversationId);

    if (Number(result.changes) === 0) {
      return undefined;
    }

    return this.get(conversationId);
  }

  async delete(conversationId: ConversationId): Promise<boolean> {
    const result = this.db
      .prepare("DELETE FROM conversations WHERE id = ?")
      .run(conversationId);

    return Number(result.changes) > 0;
  }

  async clear(conversationId: ConversationId): Promise<void> {
    this.db
      .prepare(
        `
      UPDATE conversations
      SET messages_json = ?, updated_at = ?
      WHERE id = ?
    `,
      )
      .run("[]", new Date().toISOString(), conversationId);
  }

  close(): void {
    if (this.db.isOpen) {
      this.db.close();
    }
  }

  private migrateLegacyConversationState(): void {
    const versionRow = this.db
      .prepare("PRAGMA user_version")
      .get() as DatabaseVersionRow;

    if (typeof versionRow.user_version !== "number") {
      throw new Error("Invalid SQLite user_version");
    }

    if (versionRow.user_version >= 1) {
      return;
    }

    const legacyTable = this.db
      .prepare(
        `
      SELECT 1
      FROM sqlite_master
      WHERE type = 'table' AND name = ?
    `,
      )
      .get("conversation_state");

    if (legacyTable !== undefined) {
      this.db.exec(`
      INSERT OR IGNORE INTO conversations (
        id,
        title,
        schema_version,
        messages_json,
        created_at,
        updated_at
      )
      SELECT
        id,
        id,
        schema_version,
        messages_json,
        updated_at,
        updated_at
      FROM conversation_state;
    `);
    }

    this.db.exec("PRAGMA user_version = 1;");
  }
}
