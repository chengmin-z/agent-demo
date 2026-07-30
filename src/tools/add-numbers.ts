import { z } from "zod";

import { defineTool } from "./tool.js";

const addNumbersInputSchema = z.object({
  left: z.number(),
  right: z.number(),
});

export const addNumbersTool = defineTool({
  name: "add_numbers",
  description: "Adds two numbers together.",
  inputSchema: addNumbersInputSchema,

  async execute(input) {
    return {
      content: JSON.stringify({
        sum: input.left + input.right,
      }),
      isError: false,
    };
  },
});
