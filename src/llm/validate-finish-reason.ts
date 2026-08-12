import type { ModelFinishReason } from "./model-gateway.js";

export function assertFinishReasonCompatible(
  finishReason: ModelFinishReason,
  hasToolCalls: boolean,
): void {
  switch (finishReason) {
    case "length":
      throw new Error("Model output was truncated by the token limit");

    case "content_filter":
      throw new Error("Model output was blocked by the content filter");

    case "function_call":
      throw new Error("Legacy function_call finish reason is unsupported");

    case "stop":
      if (hasToolCalls) {
        throw new Error("Finish reason stop cannot contain tool calls");
      }
      return;

    case "tool_calls":
      if (!hasToolCalls) {
        throw new Error("Finish reason tool_calls contains no tool calls");
      }
      return;
  }
}
