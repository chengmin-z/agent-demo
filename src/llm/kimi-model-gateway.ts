import type OpenAI from "openai";

import type { AppConfig } from "../config.js";
import {
  kimiAssistantMessageSchema,
  type KimiChatMessage,
  type KimiAssistantMessage,
} from "./kimi-types.js";
import type { ToolDefinition } from "../tools/tool.js";
import type { ModelGateway } from "./model-gateway.js";

export class KimiModelGateway implements ModelGateway {
  constructor(
    private readonly client: OpenAI,
    private readonly config: AppConfig,
  ) {}

  async complete(
    messages: readonly KimiChatMessage[],
    tools: readonly ToolDefinition[] = [],
    signal: AbortSignal,
  ): Promise<KimiAssistantMessage> {
    const reqMessages = messages.map(
      (msg) => msg as OpenAI.Chat.Completions.ChatCompletionMessageParam,
    );

    const request: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming =
      {
        model: this.config.KIMI_MODEL,
        messages: reqMessages,
        reasoning_effort: this.config.KIMI_REASONING_EFFORT,
        max_completion_tokens: 512,
      };

    if (tools.length > 0) {
      request.tools = [...tools];
      request.tool_choice = "auto";
    }

    const completion = await this.client.chat.completions.create(request, {
      signal,
    });

    const rawMessage = completion.choices[0]?.message;

    if (rawMessage === undefined) {
      throw new Error("Kimi returned no assistant message");
    }

    return kimiAssistantMessageSchema.parse(rawMessage);
  }
}
