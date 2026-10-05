import { createHash } from "node:crypto";
import { createReviewerFetch } from "./reviewer-transport.js";
import { withinDeadline } from "./deadline.js";
import { hashReviewBytes, reviewKeys, reviewMatch, reviewObject, reviewText } from "./review-request.js";

export interface SourceTarget {
  repositoryId: number; owner: string; repo: string; pullNumber: number;
  baseBranch: string; baseSha: string; headSha: string; allowedPaths: string[];
}
interface TreeEntry { path: string; sha: string; mode: string; type: string }
interface SourceBlob { sha: string; text: string }
export interface SourceFile { path: string; before: SourceBlob | null; after: SourceBlob | null }
export interface ImportedSource {
  schemaVersion: 1; repositoryId: number; pullNumber: number; baseSha: string; headSha: string;
  files: SourceFile[]; sourceText: string; sourceDigest: string;
}

/** Trusted importer, not a model tool. HTTPS authenticates the pinned GitHub
 * repository; Git object hashes bind every traversed tree and source blob.
 * Walk changed subtrees to prove completeness; never trust a partial PR patch. */
export async function importReviewerSource(target: SourceTarget, deps: {
  tokenProvider(): Promise<string>; fetchImpl?: typeof fetch; signal?: AbortSignal;
}): Promise<ImportedSource> {
  const stopped = new AbortController();
  const signal = deps.signal ? AbortSignal.any([deps.signal, stopped.signal]) : stopped.signal;
  const timer = setTimeout(() => stopped.abort(), 120000);
  try {
    const t = validateTarget(target);
    const transport = createReviewerFetch(deps.fetchImpl);
    const root = `https://api.github.com/repos/${t.owner}/${t.repo}`;
    let requests = 0;
    const guard = () => { if (signal.aborted) throw new Error("Import stopped"); };
    const api = async (path: string) => {
      guard(); if (++requests > 256) throw new Error("Import request budget");
      const token = await withinDeadline(deps.tokenProvider, 30000); guard();
      const response = await transport(root + path, { method: "GET", signal,
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" } });
      guard(); if (!response.ok) throw new Error("Import read rejected");
      return reviewObject(JSON.parse(await response.text()));
    };
    const current = async () => {
      const repo = await api(""); const pr = await api(`/pulls/${t.pullNumber}`);
      const base = reviewObject(pr.base), head = reviewObject(pr.head);
      if (repo.id !== t.repositoryId || repo.full_name !== `${t.owner}/${t.repo}` || repo.archived !== false || repo.disabled !== false
        || pr.number !== t.pullNumber || pr.state !== "open" || pr.merged !== false || pr.draft !== false
        || base.sha !== t.baseSha || head.sha !== t.headSha || base.ref !== t.baseBranch
        || [base, head].some(part => reviewObject(part.repo).id !== t.repositoryId || reviewObject(part.repo).full_name !== repo.full_name)
        || !Number.isSafeInteger(pr.changed_files) || Number(pr.changed_files) < 1 || Number(pr.changed_files) > 100) throw new Error("Candidate changed");
      return Number(pr.changed_files);
    };
    const count = await current();
    const comparison = await api(`/compare/${t.baseSha}...${t.headSha}`);
    if (reviewObject(comparison.merge_base_commit).sha !== t.baseSha || reviewObject(comparison.base_commit).sha !== t.baseSha) throw new Error("Candidate behind base");
    const commitTree = async (sha: string) => {
      const c = await api(`/git/commits/${sha}`); const tree = reviewObject(c.tree);
      if (c.sha !== sha) throw new Error("Commit mismatch"); oid(tree.sha); return tree.sha as string;
    };
    const trees = new Map<string, TreeEntry[]>();
    const tree = async (sha: string | null): Promise<TreeEntry[]> => {
      if (!sha) return []; if (trees.has(sha)) return trees.get(sha)!;
      const result = await api(`/git/trees/${sha}`);
      if (result.sha !== sha || result.truncated !== false || !Array.isArray(result.tree) || result.tree.length > 4096) throw new Error("Incomplete tree");
      const entries = result.tree.map(item => {
        const e = reviewObject(item); oid(e.sha);
        if (typeof e.path !== "string" || !e.path || e.path === "." || e.path === ".." || /[\\/\x00-\x1f\x7f]/.test(e.path)
          || !["100644", "100755", "040000", "160000", "120000"].includes(String(e.mode))
          || e.type !== (e.mode === "040000" ? "tree" : e.mode === "160000" ? "commit" : "blob")) throw new Error("Invalid tree entry");
        return { path: e.path, sha: e.sha as string, mode: e.mode as string, type: e.type as string };
      });
      if (new Set(entries.map(e => e.path)).size !== entries.length) throw new Error("Duplicate tree path");
      entries.sort((a, b) => Buffer.compare(Buffer.from(a.path + (a.type === "tree" ? "/" : "")), Buffer.from(b.path + (b.type === "tree" ? "/" : ""))));
      const bytes = Buffer.concat(entries.map(e => Buffer.concat([Buffer.from(`${e.mode.replace(/^0/, "")} ${e.path}\0`), Buffer.from(e.sha, "hex")])));
      if (gitHash("tree", bytes) !== sha) throw new Error("Tree hash mismatch");
      trees.set(sha, entries); return entries;
    };
    let sourceBytes = 0;
    const blob = async (entry: TreeEntry | undefined): Promise<SourceBlob | null> => {
      if (!entry) return null;
      if (entry.type !== "blob" || entry.mode !== "100644") throw new Error("Non-document object");
      const value = await api(`/git/blobs/${entry.sha}`);
      if (value.sha !== entry.sha || value.encoding !== "base64" || typeof value.content !== "string"
        || !Number.isSafeInteger(value.size) || Number(value.size) > 131072 || Number(value.size) < 0) throw new Error("Invalid blob");
      const encoded = value.content.replace(/\n/g, "");
      const bytes = Buffer.from(encoded, "base64");
      if (bytes.toString("base64") !== encoded || bytes.length !== value.size || gitHash("blob", bytes) !== entry.sha) throw new Error("Blob hash mismatch");
      sourceBytes += bytes.length; if (sourceBytes > 350000) throw new Error("Source budget");
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (text.includes("\0")) throw new Error("Binary source");
      return { sha: entry.sha, text };
    };
    const files: SourceFile[] = [];
    const walk = async (before: string | null, after: string | null, prefix = "", depth = 0): Promise<void> => {
      if (before === after) return; if (depth > 24) throw new Error("Tree depth");
      const b = new Map((await tree(before)).map(e => [e.path, e]));
      const a = new Map((await tree(after)).map(e => [e.path, e]));
      for (const name of [...new Set([...b.keys(), ...a.keys()])].sort()) {
        const old = b.get(name), next = a.get(name); const path = prefix + name;
        if (old?.sha === next?.sha && old?.mode === next?.mode) continue;
        if ([old, next].every(e => !e || e.type === "tree")) {
          await walk(old?.sha ?? null, next?.sha ?? null, path + "/", depth + 1);
        } else {
          if (!t.allowedPaths.includes(path) || files.length >= 100) throw new Error("Source outside approved paths");
          files.push({ path, before: await blob(old), after: await blob(next) });
        }
      }
    };
    await walk(await commitTree(t.baseSha), await commitTree(t.headSha));
    if (files.length !== count || await current() !== count) throw new Error("Incomplete source");
    const packet = { schemaVersion: 1 as const, repositoryId: t.repositoryId, pullNumber: t.pullNumber, baseSha: t.baseSha, headSha: t.headSha, files };
    const sourceText = JSON.stringify(packet); reviewText(sourceText, 393216); guard();
    return { ...packet, sourceText, sourceDigest: hashReviewBytes(sourceText) };
  } catch { throw new Error("Reviewer source rejected"); }
  finally { clearTimeout(timer); stopped.abort(); }
}
function oid(value: unknown): void { reviewMatch(value, /^[a-f0-9]{40}$/); }
function gitHash(kind: string, value: Buffer): string {
  return createHash("sha1").update(`${kind} ${value.length}\0`).update(value).digest("hex");
}
function validateTarget(value: SourceTarget): SourceTarget {
  const t = structuredClone(value); reviewKeys(reviewObject(t), ["repositoryId", "owner", "repo", "pullNumber", "baseBranch", "baseSha", "headSha", "allowedPaths"]);
  for (const id of [t.repositoryId, t.pullNumber]) if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid target ID");
  for (const name of [t.owner, t.repo]) reviewMatch(name, /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/);
  reviewText(t.baseBranch, 200); oid(t.baseSha); oid(t.headSha);
  if (t.baseSha === t.headSha || !Array.isArray(t.allowedPaths) || !t.allowedPaths.length || t.allowedPaths.length > 100
    || new Set(t.allowedPaths).size !== t.allowedPaths.length) throw new Error("Invalid source allowlist");
  for (const path of t.allowedPaths) {
    reviewMatch(path, /^[A-Za-z0-9_. /-]+\.(?:md|json|txt)$/);
    if (path.length > 512 || path.split("/").some(s => !s || s === "." || s === ".." || s.toLowerCase() === ".git")) throw new Error("Invalid source path");
  }
  return t;
}
