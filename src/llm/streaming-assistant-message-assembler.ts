import {
  kimiAssistantMessageSchema,
  type KimiAssistantMessage,
} from "./kimi-types.js";
import type { ModelStreamEvent, ModelFinishReason } from "./model-gateway.js";
import { assertFinishReasonCompatible } from "./validate-finish-reason.js";

type ToolCallDraft = {
  id?: string;
  toolType?: "function";
  name: string;
  arguments: string;
};

export class StreamingAssistantMessageAssembler {
  private content = "";
  private reasoningContent = "";
  private finished = false;
  private finishReason: ModelFinishReason | undefined;
  private readonly toolCallDrafts = new Map<number, ToolCallDraft>();

  add(event: ModelStreamEvent): void {
    if (this.finished) {
      throw new Error("Cannot add events after finish");
    }

    switch (event.type) {
      case "text-delta":
        this.content += event.delta;
        break;

      case "reasoning-delta":
        this.reasoningContent += event.delta;
        break;

      case "tool-call-delta": {
        if (!Number.isInteger(event.index) || event.index < 0) {
          throw new Error(`Invalid tool call index: ${event.index}`);
        }

        const draft = this.toolCallDrafts.get(event.index) ?? {
          name: "",
          arguments: "",
        };

        if (event.id !== undefined) {
          if (draft.id !== undefined && draft.id !== event.id) {
            throw new Error(`Conflicting tool call id at index ${event.index}`);
          }

          draft.id = event.id;
        }

        if (event.toolType !== undefined) {
          if (
            draft.toolType !== undefined &&
            draft.toolType !== event.toolType
          ) {
            throw new Error(
              `Conflicting tool call type at index ${event.index}`,
            );
          }

          draft.toolType = event.toolType;
        }

        if (event.nameDelta !== undefined) {
          draft.name += event.nameDelta;
        }

        if (event.argumentsDelta !== undefined) {
          draft.arguments += event.argumentsDelta;
        }

        this.toolCallDrafts.set(event.index, draft);
        break;
      }
      case "message-finish":
        if (this.finishReason !== undefined) {
          throw new Error("Duplicate message finish event");
        }

        this.finished = true;
        this.finishReason = event.finishReason;
        break;
    }
  }

  finish(): KimiAssistantMessage {
    if (this.finishReason === undefined) {
      throw new Error("Stream ended without message finish event");
    }

    assertFinishReasonCompatible(
      this.finishReason,
      this.toolCallDrafts.size > 0,
    );

    const toolCalls = [...this.toolCallDrafts.entries()]
      .sort(([leftIndex], [rightIndex]) => leftIndex - rightIndex)
      .map(([index, draft]) => {
        if (draft.id === undefined || draft.id.length === 0) {
          throw new Error(`Tool call ${index} has no id`);
        }

        if (draft.toolType !== "function") {
          throw new Error(`Tool call ${index} has no function type`);
        }

        if (draft.name.length === 0) {
          throw new Error(`Tool call ${index} has no function name`);
        }

        return {
          id: draft.id,
          type: draft.toolType,
          function: {
            name: draft.name,
            arguments: draft.arguments,
          },
        };
      });

    return kimiAssistantMessageSchema.parse({
      role: "assistant",
      content: this.content.length > 0 ? this.content : null,
      ...(this.reasoningContent.length > 0
        ? { reasoning_content: this.reasoningContent }
        : {}),
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    });
  }
}
