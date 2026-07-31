import { readFile, stat } from "node:fs/promises";
import { relative } from "node:path";
import { TextDecoder } from "node:util";
import { z } from "zod";

import { containsProtectedSegment } from "../workspace/file-access-policy.js";
import type { Workspace } from "../workspace/workspace.js";
import { defineTool } from "./tool.js";

const MAX_FILE_BYTES = 64 * 1024; // 64 KB
const MAX_LINES = 200;

/// muliple steps to read file with batch operation
const readFileInputSchema = z.object({
  path: z.string().min(1),
  startLine: z.number().int().positive().default(1),
  maxLines: z.number().int().positive().max(MAX_LINES).default(MAX_LINES),
});

export function createReadFileTool(workspace: Workspace) {
  return defineTool({
    name: "read_file",
    description: "read text file encoded with UTF-8 in workspace",
    inputSchema: readFileInputSchema,

    async execute(input, signal) {
      signal.throwIfAborted();
      const resolvedPath = await workspace.resolveExisting(input.path);

      const relativePath = relative(workspace.root, resolvedPath) || ".";
      if (containsProtectedSegment(relativePath)) {
        throw new Error("Requested path is protected");
      }

      const stats = await stat(resolvedPath);
      if (!stats.isFile()) {
        throw new Error("Requested path is not a file");
      }

      if (stats.size > MAX_FILE_BYTES) {
        throw new Error("Requested file is too big to read");
      }

      const buffer = await readFile(resolvedPath, { signal });

      if (buffer.byteLength > MAX_FILE_BYTES) {
        throw new Error("Requested file is too big to read");
      }

      if (buffer.includes(0)) {
        throw new Error("Requested file appears to be binary");
      }

      let text: string;
      try {
        const decoder = new TextDecoder("utf-8", { fatal: true });
        text = decoder.decode(buffer);
      } catch (error: unknown) {
        throw new Error("Requested file is not valid UTF-8 text", {
          cause: error,
        });
      }

      signal.throwIfAborted();

      const lines = text.split(/\r?\n/);
      const startIndex = input.startLine - 1;

      if (startIndex >= lines.length) {
        throw new Error("startLine exceeds file length");
      }

      const selectedLines = lines.slice(
        startIndex,
        startIndex + input.maxLines,
      );

      const endLine = startIndex + selectedLines.length;
      const totalLines = lines.length;
      const truncated: boolean = startIndex > 0 || endLine < totalLines;
      const content = selectedLines.join("\n");

      return {
        content: JSON.stringify({
          path: relativePath,
          startLine: input.startLine,
          endLine: endLine,
          totalLines: totalLines,
          sizeBytes: buffer.byteLength,
          content: content,
          truncated: truncated,
        }),
        isError: false,
      };
    },
  });
}
