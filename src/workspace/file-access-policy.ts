export function isProtectedName(name: string): boolean {
  const blacklist = [".git", "node_modules", "dist", ".env"];
  if (blacklist.includes(name)) {
    return true;
  }
  if (name.startsWith(".env.") && name !== ".env.example") {
    return true;
  }
  return false;
}

export function containsProtectedSegment(path: string): boolean {
  return path.split(/[\\/]+/).some((segment) => isProtectedName(segment));
}
