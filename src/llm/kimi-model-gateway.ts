import type OpenAI from "openai";

import type { AppConfig } from "../config.js";
import {
  kimiAssistantMessageSchema,
  type KimiChatMessage,
} from "./kimi-types.js";
import type { ToolDefinition } from "../tools/tool.js";
import type {
  ModelGateway,
  ModelStreamEvent,
  ModelCompletion,
} from "./model-gateway.js";
import { assertFinishReasonCompatible } from "./validate-finish-reason.js";

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
  ): Promise<ModelCompletion> {
    const reqMessages = messages.map(
      (msg) => msg as OpenAI.Chat.Completions.ChatCompletionMessageParam,
    );

    const request: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming =
      {
        model: this.config.KIMI_MODEL,
        messages: reqMessages,
        reasoning_effort: this.config.KIMI_REASONING_EFFORT,
        max_tokens: this.config.KIMI_MAX_TOKENS,
      };

    if (tools.length > 0) {
      request.tools = [...tools];
      request.tool_choice = "auto";
    }

    const completion = await this.client.chat.completions.create(request, {
      signal,
    });

    const choice = completion.choices.find((item) => item.index === 0);

    if (choice === undefined) {
      throw new Error("Kimi returned no assistant choice");
    }

    assertFinishReasonCompatible(
      choice.finish_reason,
      (choice.message.tool_calls?.length ?? 0) > 0,
    );

    const message = kimiAssistantMessageSchema.parse(choice.message);

    return {
      message,
      usage: completion.usage
        ? {
            promptTokens: completion.usage.prompt_tokens,
            completionTokens: completion.usage.completion_tokens,
            totalTokens: completion.usage.total_tokens,
          }
        : undefined,
    };
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
        max_tokens: this.config.KIMI_MAX_TOKENS,
        stream: true,
        stream_options: {
          include_usage: true,
        },
      };

    if (tools.length > 0) {
      request.tools = [...tools];
      request.tool_choice = "auto";
    }

    const stream = await this.client.chat.completions.create(request, {
      signal,
    });

    for await (const chunk of stream) {
      if (chunk.usage !== null && chunk.usage !== undefined) {
        yield {
          type: "usage",
          usage: {
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens,
          },
        };
      }

      const choice = chunk.choices.find((choice) => choice.index === 0);

      if (choice === undefined) {
        continue;
      }

      const delta = choice.delta as KimiChatCompletionDelta;

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

      if (choice.finish_reason !== null) {
        yield {
          type: "message-finish",
          finishReason: choice.finish_reason,
        };
      }
    }
  }
}
