import {
  kimiAssistantMessageSchema,
  type KimiAssistantMessage,
} from "./kimi-types.js";
import type { ModelStreamEvent } from "./model-gateway.js";

type ToolCallDraft = {
  id?: string;
  toolType?: "function";
  name: string;
  arguments: string;
};

export class StreamingAssistantMessageAssembler {
  private content = "";
  private reasoningContent = "";
  private readonly toolCallDrafts = new Map<number, ToolCallDraft>();

  add(event: ModelStreamEvent): void {
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
    }
  }

  finish(): KimiAssistantMessage {
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
