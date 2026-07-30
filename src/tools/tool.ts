import { z } from "zod";

export type ToolResult = {
  content: string;
  isError: boolean;
};

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export interface AgentTool {
  readonly name: string;
  readonly definition: ToolDefinition;

  execute(rawInput: unknown, signal: AbortSignal): Promise<ToolResult>;
}

type DefineToolOptions<Input> = {
  name: string;
  description: string;
  inputSchema: z.ZodType<Input>;

  execute(input: Input, signal: AbortSignal): Promise<ToolResult>;
};

export function defineTool<Input>(
  options: DefineToolOptions<Input>,
): AgentTool {
  const generatedSchema = z.toJSONSchema(options.inputSchema, {
    target: "draft-07",
  });

  const parameters: Record<string, unknown> = {
    ...generatedSchema,
  };

  delete parameters.$schema;

  return {
    name: options.name,

    definition: {
      type: "function",
      function: {
        name: options.name,
        description: options.description,
        parameters,
      },
    },

    async execute(rawInput: unknown, signal: AbortSignal): Promise<ToolResult> {
      const input = options.inputSchema.parse(rawInput);
      return options.execute(input, signal);
    },
  };
}
