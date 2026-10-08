import fs from "node:fs/promises";
import path from "node:path";

// Resolve the trusted repository root only. Catalog layout symlinks must never
// broaden the selected stack's writable sandbox grant or redirect metadata reads.
export async function assertCanonicalStackDirectory(root: string, stackDir: string): Promise<string> {
  const relative = path.relative(path.resolve(root), path.resolve(stackDir));
  const segments = relative.split(path.sep);
  if (segments.length !== 3 || segments[0] !== "catalog" || segments[1] !== "stacks"
    || !/^[a-z0-9][a-z0-9_-]*$/.test(segments[2])) {
    throw new Error("Verification cwd must be an exact canonical catalog/stacks/<id> directory");
  }
  let directory = await fs.realpath(root);
  for (const segment of segments) {
    directory = path.join(directory, segment);
    const stat = await fs.lstat(directory);
    if (stat.isSymbolicLink()) throw new Error(`Verification layout must not contain symlinks: ${segment}`);
    if (!stat.isDirectory()) throw new Error(`Verification layout must contain directories: ${segment}`);
  }
  return directory;
}
