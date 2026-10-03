export async function repositoryHead(repository, runGit) {
  try {
    return (await runGit(repository.path, ["rev-parse", "--verify", "HEAD^{commit}"], {
      operation: `Read HEAD for ${repository.id}`,
    })).stdout.trim();
  } catch (headError) {
    if (headError.cause?.code !== 128) throw headError;
    let ref;
    try {
      ref = (await runGit(repository.path, ["symbolic-ref", "--quiet", "HEAD"])).stdout.trim();
    } catch {
      throw headError;
    }
    if (!ref?.startsWith("refs/heads/")) throw headError;
    try {
      await runGit(repository.path, ["show-ref", "--verify", "--quiet", ref]);
    } catch (refError) {
      // Only an absent branch ref proves an unborn HEAD. Corruption and timeouts fail closed.
      if (refError.cause?.code === 1) return null;
    }
    throw headError;
  }
}

export function requireSourceHead(value) {
  if (value === null) return null;
  if (typeof value !== "string" || !/^[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error("source_head must be a 40-character Git object ID or explicit null for an unborn repository.");
  }
  return value.toLowerCase();
}
