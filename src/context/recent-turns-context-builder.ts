import type { KimiChatMessage } from "../llm/kimi-types.js";
import type { ContextBuilder } from "./context-builder.js";
import { estimateContextTokens } from "./estimate-context-tokens.js";

export class RecentTurnsContextBuilder implements ContextBuilder {
  constructor(
    private readonly maxTurns: number,
    private readonly maxEstimatedTokens: number,
  ) {
    if (!Number.isInteger(maxTurns) || maxTurns < 1) {
      throw new Error("maxTurns must be a positive integer");
    }

    if (!Number.isInteger(maxEstimatedTokens) || maxEstimatedTokens < 1) {
      throw new Error("maxEstimatedTokens must be a positive integer");
    }
  }

  build(messages: readonly KimiChatMessage[]): readonly KimiChatMessage[] {
    const systemMessage = messages[0];

    if (systemMessage?.role !== "system") {
      throw new Error("context must start with a system message");
    }

    if (messages.at(-1)?.role !== "user") {
      throw new Error("context must end with the current user message");
    }

    const turns: KimiChatMessage[][] = [];

    for (const message of messages.slice(1)) {
      if (message.role === "system") {
        throw new Error(
          "context must not contain system messages after the first message",
        );
      }

      if (message.role === "user") {
        turns.push([message]);
        continue;
      }

      const currentTurn = turns.at(-1);
      if (currentTurn === undefined) {
        throw new Error(
          "context must not start with an assistant or tool message",
        );
      }

      currentTurn.push(message);
    }

    const candidateTurns = turns.slice(-this.maxTurns);
    const selectedTurns: KimiChatMessage[][] = [];

    let estimatedTokens = estimateContextTokens([systemMessage]);

    for (let index = candidateTurns.length - 1; index >= 0; index--) {
      const turn = candidateTurns[index];

      if (turn === undefined) {
        continue;
      }

      const turnTokens = estimateContextTokens(turn);

      if (estimatedTokens + turnTokens > this.maxEstimatedTokens) {
        if (selectedTurns.length === 0) {
          throw new Error(
            "system message and current turn exceed the context budget",
          );
        }

        break;
      }

      selectedTurns.unshift(turn);
      estimatedTokens += turnTokens;
    }

    return [systemMessage, ...selectedTurns.flat()];
  }
}
