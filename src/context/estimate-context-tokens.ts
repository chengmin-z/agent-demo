import { Buffer } from "node:buffer";
import type { KimiChatMessage } from "../llm/kimi-types.js";

const APPROXIMATE_BYTES_PER_TOKEN = 3;

export function estimateContextTokens(
  messages: readonly KimiChatMessage[],
): number {
  if (messages.length === 0) {
    return 0;
  }

  const serialized = JSON.stringify(messages);

  if (serialized === undefined) {
    throw new Error("context could not be serialized");
  }

  const bytes = Buffer.byteLength(serialized, "utf8");

  return Math.ceil(bytes / APPROXIMATE_BYTES_PER_TOKEN);
}
