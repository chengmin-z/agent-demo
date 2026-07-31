import "dotenv/config";

import { loadConfig } from "./config.js";
import { createKimiClient } from "./llm/kimi-client.js";
import { KimiModelGateway } from "./llm/kimi-model-gateway.js";
import { addNumbersTool } from "./tools/add-numbers.js";
import { ToolRegistry } from "./tools/tool-registry.js";
import { AgentEngine } from "./agent/agent-engine.js";
import { createListFileTool } from "./tools/list-files.js";
import { createReadFileTool } from "./tools/read-file.js";
import { Workspace } from "./workspace/workspace.js";
import { DEFAULT_SYSTEM_PROMPT } from "./agent/system-prompt.js";

const config = loadConfig(process.env);
const client = createKimiClient(config);
const modelGateway = new KimiModelGateway(client, config);
const workspace = await Workspace.open(process.cwd());
const toolRegistry = new ToolRegistry([
  addNumbersTool,
  createListFileTool(workspace),
  createReadFileTool(workspace),
]);

const agentEngine = new AgentEngine(
  modelGateway,
  toolRegistry,
  DEFAULT_SYSTEM_PROMPT,
  config.MAX_AGENT_STEPS,
);

const abortController = new AbortController();

const result = await agentEngine.run(
  "Can you read package.json? Report the project name, scripts, dependencies, and devDependencies using only the file contents.",
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
