import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { hashReviewBytes, parseReviewCandidate, parseReviewJson, reviewId, reviewKeys, reviewObject,
  reviewText, reviewMatch, validateReviewAuthority, REVIEW_MODEL, REVIEW_EFFORT } from "./review-request.js";
import type { ReviewBinding, ReviewEvidence } from "./review-evidence.js";
import { prepareNativeEvidence } from "./native-acceptance.js";

export interface ReviewAuthority {
  withLock<T>(id: string, operation: () => Promise<T>): Promise<T>;
  loadCandidate(id: string): Promise<string>;
  loadPolicy(): Promise<string>;
  loadProof(digest: string): Promise<string>;
  loadRuntimeProof?(digest: string): Promise<string>;
  loadIntent(id: string): Promise<unknown>;
  loadAudit(id: string): Promise<unknown>;
  writeIntent(id: string, value: unknown): Promise<void>;
  writeAudit(id: string, value: unknown): Promise<void>;
}
export interface NativeReviewHost {
  // Trusted host boundary: owns isolated launch, channel and termination. Never a model tool.
  review(request: { contentClass: "private_repository"; packet: string; packetDigest: string; timeoutMs: number }, options: { signal: AbortSignal }): Promise<unknown>;
}
export interface ReviewControllerDependencies {
  authority: ReviewAuthority; nativeHost: NativeReviewHost; enabled(): Promise<boolean>;
  timeoutMs?: number; now?: () => number;
}
export interface ReviewAudit {
  schemaVersion: 1; status: "held"; acceptanceEligible: false; publication: null;
  requestId: string; executionId: string; issuedAt: number; candidateDigest: string;
  packetDigest: string; outputDigest: string; outputText: string; binding: ReviewBinding;
  native: Record<string, unknown>; verdicts: Record<string, unknown>; findings: unknown[]; blockers: string[];
}
/** No signer/token/publisher capability enters this controller. Raw native
 * observations require explicit protected policy/proof preparation before signing. */
export function createReviewController(deps: ReviewControllerDependencies) {
  const timeoutMs = deps.timeoutMs ?? 900000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 900000) throw new Error("Invalid review deadline");
  const run = async (requestId: string, options: { signal?: AbortSignal }, mode: "audit" | "acceptance"): Promise<ReviewAudit | ReviewEvidence> => {
      let active = true; let timer: ReturnType<typeof setTimeout> | undefined;
      const abort = new AbortController();
      let cancel: () => void = () => {};
      const cancelled = new Promise<never>((_resolve, reject) => {
        cancel = () => { active = false; abort.abort(); reject(new Error("Review cancelled")); };
      });
      void cancelled.catch(() => {});
      options.signal?.addEventListener("abort", cancel, { once: true });
      if (options.signal?.aborted) cancel();
      const guard = () => { if (!active || options.signal?.aborted) throw new Error("Review stopped"); };
      const call = async <T>(operation: () => Promise<T>): Promise<T> => { guard(); const result = await operation(); guard(); return result; };
      const enabled = async () => { if (await call(deps.enabled) !== true) throw new Error("Review disabled"); };
      try {
        reviewId(requestId);
        const run = async () => {
          await enabled();
          return call(() => deps.authority.withLock(requestId, async () => {
            guard();
            const raw = await call(() => deps.authority.loadCandidate(requestId));
            const candidate = parseReviewCandidate(raw);
            const candidateDigest = hashReviewBytes(raw);
            const policy = await call(() => deps.authority.loadPolicy());
            const proof = await call(() => deps.authority.loadProof(candidate.binding.proofDigest));
            const validatedPolicy = validateReviewAuthority(candidate, policy, proof);
            const packet = JSON.stringify({ binding: candidate.binding, contract: candidate.contractText,
              source: candidate.sourceText, sourceDigest: candidate.sourceDigest, proof: JSON.parse(proof) });
            reviewText(packet, 524288);
            const packetDigest = hashReviewBytes(packet);
            const intent = await call(() => deps.authority.loadIntent(requestId));
            const previous = await call(() => deps.authority.loadAudit(requestId));
            if (previous !== undefined) {
              const audit = validatePrevious(previous, { candidateDigest, requestId, packetDigest, binding: candidate.binding }, intent);
              if (mode === "audit") return audit;
              const readRuntime = deps.authority.loadRuntimeProof;
              if (candidate.schemaVersion !== 2 || !candidate.runtimeProofDigest || !readRuntime) throw new Error("Native acceptance requires explicit authority");
              const digest = candidate.runtimeProofDigest;
              const runtime = await call(() => readRuntime.call(deps.authority, digest));
              await enabled();
              if (await call(() => readRuntime.call(deps.authority, digest)) !== runtime
                || await call(() => deps.authority.loadPolicy()) !== policy) throw new Error("Acceptance authority changed");
              await enabled();
              return prepareNativeEvidence(audit, candidate, validatedPolicy, runtime, (deps.now ?? Date.now)());
            }
            if (mode === "acceptance") throw new Error("Completed audit required");
            if (intent !== undefined) throw new Error("Uncertain review requires reconciliation");
            const executionId = randomUUID();
            await call(() => deps.authority.writeIntent(requestId, { schemaVersion: 1, requestId, executionId, candidateDigest, packetDigest }));
            await enabled();
            if (await call(() => deps.authority.loadPolicy()) !== policy) throw new Error("Review policy changed");
            const observed = validateObservation(await call(() => deps.nativeHost.review({ contentClass: "private_repository", packet, packetDigest, timeoutMs }, { signal: abort.signal })), packetDigest);
            const output = validateVerdict(observed.outputText as string);
            const { outputText, ...native } = observed;
            const issuedAt = (deps.now ?? Date.now)();
            if (!Number.isSafeInteger(issuedAt) || issuedAt <= 0) throw new Error("Invalid review clock");
            const audit: ReviewAudit = {
              schemaVersion: 1, status: "held", acceptanceEligible: false, publication: null, requestId,
              executionId, issuedAt, candidateDigest, packetDigest, binding: candidate.binding,
              outputDigest: hashReviewBytes(outputText as string), outputText: outputText as string, native, ...output,
              blockers: reviewBlockers(output),
            };
            await enabled();
            if (await call(() => deps.authority.loadPolicy()) !== policy) throw new Error("Review policy changed");
            await call(() => deps.authority.writeAudit(requestId, audit));
            return audit;
          }));
        };
        return await Promise.race([run(), cancelled, new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => { active = false; abort.abort(); reject(new Error("Review deadline")); }, timeoutMs);
        })]);
      } catch { throw new Error("Review controller rejected; inspect protected intent before retry"); }
      finally { active = false; abort.abort(); clearTimeout(timer); options.signal?.removeEventListener("abort", cancel); }
    };
  return {
    audit: (id: string, options: { signal?: AbortSignal } = {}) => run(id, options, "audit") as Promise<ReviewAudit>,
    prepareAcceptance: (id: string, options: { signal?: AbortSignal } = {}) => run(id, options, "acceptance") as Promise<ReviewEvidence>,
  };
}
function validateObservation(value: unknown, packetDigest: string): Record<string, unknown> {
  const n = reviewObject(value);
  reviewKeys(n, ["schemaVersion", "status", "runtime", "threadId", "turnId", "requested", "observed", "effectiveExecution", "acceptanceEligible", "assurance", "access", "freshContext", "packetDigest", "outputText", "terminationConfirmed"]);
  reviewId(n.threadId); reviewId(n.turnId); reviewText(n.outputText, 131072);
  const requested = reviewObject(n.requested); const observed = reviewObject(n.observed);
  reviewKeys(requested, ["model", "effort"]); reviewKeys(observed, ["model", "effort", "provider", "accountType"]);
  if (n.schemaVersion !== 1 || n.status !== "observed" || n.runtime !== "0.151.0" || n.effectiveExecution !== null
    || n.acceptanceEligible !== false || n.assurance !== "native-session-configuration-only" || n.access !== "read-only"
    || n.freshContext !== true || n.packetDigest !== packetDigest || n.terminationConfirmed !== true
    || requested.model !== REVIEW_MODEL || requested.effort !== REVIEW_EFFORT || observed.model !== REVIEW_MODEL
    || observed.effort !== REVIEW_EFFORT || observed.provider !== "openai" || observed.accountType !== "chatgpt") throw new Error("Native observation rejected");
  return structuredClone(n);
}
function validateVerdict(raw: string): { verdicts: Record<string, unknown>; findings: unknown[] } {
  const result = parseReviewJson(raw, 131072); reviewKeys(result, ["verdicts", "findings"]);
  const verdicts = reviewObject(result.verdicts); reviewKeys(verdicts, ["standards", "spec", "proof", "overall"]);
  if (Object.values(verdicts).some(value => typeof value !== "string" || !["pass", "revise", "blocked"].includes(value))
    || !Array.isArray(result.findings) || result.findings.length > 100) throw new Error("Invalid review verdict");
  for (const item of result.findings) {
    const finding = reviewObject(item); reviewKeys(finding, ["priority", "disposition"]);
    if (![0, 1, 2, 3].includes(Number(finding.priority)) || typeof finding.priority !== "number"
      || typeof finding.disposition !== "string" || finding.disposition.includes("\0") || finding.disposition.length > 1000) throw new Error("Invalid finding");
  }
  return { verdicts, findings: result.findings };
}
function reviewBlockers(output: { verdicts: Record<string, unknown>; findings: unknown[] }): string[] {
  const failing = Object.values(output.verdicts).some(value => value !== "pass")
    || output.findings.some(item => reviewObject(item).priority !== 3 || !String(reviewObject(item).disposition).trim());
  return ["effective_execution_attestation_unavailable", ...(failing ? ["review_not_passing"] : [])];
}
function validatePrevious(value: unknown, expected: { candidateDigest: string; requestId: string; packetDigest: string; binding: ReviewBinding }, intentValue: unknown): ReviewAudit {
  const r = reviewObject(value); const intent = reviewObject(intentValue);
  reviewKeys(r, ["schemaVersion", "status", "acceptanceEligible", "publication", "requestId", "executionId", "issuedAt", "candidateDigest",
    "packetDigest", "outputDigest", "outputText", "binding", "native", "verdicts", "findings", "blockers"]);
  reviewKeys(intent, ["schemaVersion", "requestId", "executionId", "candidateDigest", "packetDigest"]);
  reviewMatch(r.executionId, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
  reviewText(r.outputText, 131072);
  if (r.schemaVersion !== 1 || r.status !== "held" || r.acceptanceEligible !== false || r.publication !== null
    || !Number.isSafeInteger(r.issuedAt) || Number(r.issuedAt) <= 0 || r.candidateDigest !== expected.candidateDigest
    || r.requestId !== expected.requestId || r.packetDigest !== expected.packetDigest || !isDeepStrictEqual(r.binding, expected.binding)
    || intent.schemaVersion !== 1 || intent.executionId !== r.executionId || intent.requestId !== expected.requestId
    || intent.candidateDigest !== expected.candidateDigest || intent.packetDigest !== expected.packetDigest
    || r.outputDigest !== hashReviewBytes(r.outputText)) throw new Error("Stored audit mismatch");
  const native = reviewObject(r.native);
  if (Object.hasOwn(native, "outputText")) throw new Error("Invalid stored native fields");
  validateObservation({ ...native, outputText: r.outputText }, expected.packetDigest);
  const output = validateVerdict(r.outputText);
  if (!isDeepStrictEqual(output.verdicts, r.verdicts) || !isDeepStrictEqual(output.findings, r.findings)
    || !isDeepStrictEqual(reviewBlockers(output), r.blockers)) throw new Error("Stored verdict mismatch");
  return structuredClone(r) as unknown as ReviewAudit;
}
