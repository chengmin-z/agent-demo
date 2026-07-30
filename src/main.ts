import "dotenv/config";

import { loadConfig } from "./config.js";
import { createKimiClient } from "./llm/kimi-client.js";
import { KimiModelGateway } from "./llm/kimi-model-gateway.js";
import { addNumbersTool } from "./tools/add-numbers.js";
import { ToolRegistry } from "./tools/tool-registry.js";
import { AgentEngine } from "./agent/agent-engine.js";
import { createListFileTool } from "./tools/list-files.js";
import { Workspace } from "./workspace/workspace.js";

const config = loadConfig(process.env);
const client = createKimiClient(config);
const modelGateway = new KimiModelGateway(client, config);
const workspace = await Workspace.open(process.cwd());
const toolRegistry = new ToolRegistry([
  addNumbersTool,
  createListFileTool(workspace),
]);

const agentEngine = new AgentEngine(
  modelGateway,
  toolRegistry,
  config.MAX_AGENT_STEPS,
);

const abortController = new AbortController();

const result = await agentEngine.run(
  "You must use the list_files tool to list the workspace root. Then briefly summarize the project structure. Do not guess.",
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
