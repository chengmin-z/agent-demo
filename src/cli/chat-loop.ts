import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";

import type { AgentEngine } from "../agent/agent-engine.js";
import type { KimiChatMessage } from "../llm/kimi-types.js";

export async function runChatLoop(agentEngine: AgentEngine): Promise<void> {
  const readline = createInterface({ input, output });
  let history: readonly KimiChatMessage[] = [];

  try {
    while (true) {
      const prompt = (await readline.question("You> ")).trim();
      if (prompt.length === 0) {
        continue;
      }

      if (prompt === "/exit" || prompt === "/quit") {
        break;
      }

      if (prompt === "/clear") {
        history = [];
        console.log("[info] conversation cleared");
        continue;
      }

      const abortController = new AbortController();

      try {
        const result = await agentEngine.runTurn(
          history,
          prompt,
          abortController.signal,
        );

        history = result.messages;

        for (const execution of result.toolExecutions) {
          const status = execution.result.isError ? "failed" : "succeeded";
          console.log(`[tool] ${execution.toolName} ${status}`);
        }

        console.log(`Agent> ${result.finalMessage.content ?? ""}`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[error] ${message}`);
      }
    }
  } finally {
    readline.close();
  }
}
