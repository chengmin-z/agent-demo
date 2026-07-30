import "dotenv/config";

import { loadConfig } from "./config.js";
import { createKimiClient } from "./llm/kimi-client.js";
import { KimiModelGateway } from "./llm/kimi-model-gateway.js";
import { addNumbersTool } from "./tools/add-numbers.js";
import { ToolRegistry } from "./tools/tool-registry.js";
import { AgentEngine } from "./agent/agent-engine.js";

const config = loadConfig(process.env);
const client = createKimiClient(config);
const modelGateway = new KimiModelGateway(client, config);

const toolRegistry = new ToolRegistry([addNumbersTool]);

const agentEngine = new AgentEngine(
  modelGateway,
  toolRegistry,
  config.MAX_AGENT_STEPS,
);

const abortController = new AbortController();

const result = await agentEngine.run(
  "You must use the add_numbers tool to calculate 12345 + 67890. Do not calculate it yourself.",
  abortController.signal,
);

for (const execution of result.toolExecutions) {
  console.log(
    `Tool ${execution.toolName} ` +
      `${execution.result.isError ? "failed" : "succeeded"}:`,
    execution.result.content,
  );
}

console.log("Steps:", result.steps);
console.log("Final response:", result.finalMessage.content);
