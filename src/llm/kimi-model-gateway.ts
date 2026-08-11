import type OpenAI from "openai";

import type { AppConfig } from "../config.js";
import {
  kimiAssistantMessageSchema,
  type KimiChatMessage,
  type KimiAssistantMessage,
} from "./kimi-types.js";
import type { ToolDefinition } from "../tools/tool.js";
import type { ModelGateway, ModelStreamEvent } from "./model-gateway.js";

type KimiChatCompletionDelta =
  OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta & {
    reasoning_content?: string | null;
  };

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

  async *streamMessage(
    messages: readonly KimiChatMessage[],
    tools: readonly ToolDefinition[],
    signal: AbortSignal,
  ): AsyncIterable<ModelStreamEvent> {
    const reqMessages = messages.map(
      (msg) => msg as OpenAI.Chat.Completions.ChatCompletionMessageParam,
    );

    const request: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming =
      {
        model: this.config.KIMI_MODEL,
        messages: reqMessages,
        reasoning_effort: this.config.KIMI_REASONING_EFFORT,
        max_completion_tokens: 512,
        stream: true,
      };

    if (tools.length > 0) {
      request.tools = [...tools];
      request.tool_choice = "auto";
    }

    const stream = await this.client.chat.completions.create(request, {
      signal,
    });

    for await (const chunk of stream) {
      const rawDelta = chunk.choices.find(
        (choice) => choice.index === 0,
      )?.delta;

      if (rawDelta === undefined) {
        continue;
      }
      const delta = rawDelta as KimiChatCompletionDelta;
      if (
        typeof delta.reasoning_content === "string" &&
        delta.reasoning_content.length > 0
      ) {
        yield {
          type: "reasoning-delta",
          delta: delta.reasoning_content,
        };
      }

      if (typeof delta.content === "string" && delta.content.length > 0) {
        yield {
          type: "text-delta",
          delta: delta.content,
        };
      }

      for (const toolCall of delta.tool_calls ?? []) {
        yield {
          type: "tool-call-delta",
          index: toolCall.index,
          id: toolCall.id,
          toolType: toolCall.type,
          nameDelta: toolCall.function?.name,
          argumentsDelta: toolCall.function?.arguments,
        };
      }
    }
  }
}
