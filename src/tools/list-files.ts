import { readdir, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { join, relative } from "node:path";
import { z } from "zod";

import { Workspace } from "../workspace/workspace.js";
import { defineTool } from "./tool.js";

const listFilesInputSchema = z.object({
  path: z.string().min(1).default("."),
});

type EntryKind = "file" | "directory" | "symlink" | "other";
const MAX_ENTRIES = 100;

function isSensitive(name: string): boolean {
  const blacklist = [".git", "node_modules", "dist", ".env"];
  if (blacklist.includes(name)) {
    return true;
  }
  if (name.startsWith(".env.") && name !== ".env.example") {
    return true;
  }
  return false;
}

function containsSensitiveSegment(path: string): boolean {
  return path.split(/[\\/]+/).some((segment) => isSensitive(segment));
}

function getEntryKind(dir: Dirent): EntryKind {
  if (dir.isSymbolicLink()) {
    return "symlink";
  } else if (dir.isDirectory()) {
    return "directory";
  } else if (dir.isFile()) {
    return "file";
  }
  return "other";
}

export function createListFileTool(workspace: Workspace) {
  return defineTool({
    name: "list_files",
    description: "Lists files and directories inside the workspace.",
    inputSchema: listFilesInputSchema,

    async execute(input, signal) {
      signal.throwIfAborted();
      const resolvedPath = await workspace.resolveExisting(input.path);

      const basePath = relative(workspace.root, resolvedPath) || ".";
      if (containsSensitiveSegment(basePath)) {
        throw new Error("Requested path is protected");
      }

      const stats = await stat(resolvedPath);
      if (!stats.isDirectory()) {
        throw new Error("Requested path is not a directory");
      }

      const entries = await readdir(resolvedPath, { withFileTypes: true });
      signal.throwIfAborted();

      const resolvedEntries = entries
        .filter((entry) => {
          return !isSensitive(entry.name);
        })
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((entry) => {
          const entryPath = join(basePath, entry.name);
          return {
            path: entryPath,
            kind: getEntryKind(entry),
          };
        });

      const truncated = resolvedEntries.length > MAX_ENTRIES;
      const limitedEntries = resolvedEntries.slice(0, MAX_ENTRIES);

      return {
        content: JSON.stringify({
          path: basePath,
          entries: limitedEntries,
          truncated,
        }),
        isError: false,
      };
    },
  });
}
