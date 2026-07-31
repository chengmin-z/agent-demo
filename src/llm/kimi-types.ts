import { z } from "zod";

const kimiFunctionToolCallSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal("function"),
    function: z
      .object({
        name: z.string().min(1),
        arguments: z.string(),
      })
      .passthrough(),
  })
  .passthrough();

export const kimiAssistantMessageSchema = z
  .object({
    role: z.literal("assistant"),
    content: z.string().nullable(),
    reasoning_content: z.string().nullable().optional(),
    tool_calls: z.array(kimiFunctionToolCallSchema).optional(),
  })
  .passthrough();

export type KimiAssistantMessage = z.infer<typeof kimiAssistantMessageSchema>;

export type KimiUserMessage = {
  role: "user";
  content: string;
};

export type KimiFunctionToolCall = z.infer<typeof kimiFunctionToolCallSchema>;

export type KimiToolMessage = {
  role: "tool";
  tool_call_id: string;
  content: string;
};

export type KimiSystemMessage = {
  role: "system";
  content: string;
};

export type KimiChatMessage =
  KimiUserMessage | KimiAssistantMessage | KimiToolMessage | KimiSystemMessage;
