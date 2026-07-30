import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

function isOutside(root: string, target: string): boolean {
  const relativePath = relative(root, target);
  return (
    relativePath.startsWith(`..${sep}`) ||
    relativePath === ".." ||
    isAbsolute(relativePath)
  );
}

export class Workspace {
  readonly root: string;

  private constructor(root: string) {
    this.root = root;
  }

  static async open(root: string): Promise<Workspace> {
    const realRoot = await realpath(root);
    const stats = await stat(realRoot);
    if (!stats.isDirectory()) {
      throw new Error(`Workspace root is not a directory: ${realRoot}`);
    }
    return new Workspace(realRoot);
  }

  async resolveExisting(input: string): Promise<string> {
    if (input.includes("\0")) {
      throw new Error(`Path contains null byte: ${input}`);
    }
    if (isAbsolute(input)) {
      throw new Error(`Path is absolute: ${input}`);
    }
    const segments = input.split(/[\\/]+/);
    if (segments.some((segment) => segment === "..")) {
      throw new Error(`Path contains "..": ${input}`);
    }

    const resolvedPath = resolve(this.root, input);
    if (isOutside(this.root, resolvedPath)) {
      throw new Error(`Path is outside workspace: ${input}`);
    }

    let realPath: string;
    try {
      realPath = await realpath(resolvedPath);
    } catch (error: unknown) {
      throw new Error("Path does not exist or is inaccessible", {
        cause: error,
      });
    }

    if (isOutside(this.root, realPath)) {
      throw new Error(`Path is outside workspace: ${input}`);
    }

    return realPath;
  }
}
