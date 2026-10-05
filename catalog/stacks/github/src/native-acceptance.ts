import { hashReviewBytes, parseReviewJson, reviewObject, reviewKeys, reviewId, reviewMatch, validateReviewChecks,
  REVIEW_MODEL, REVIEW_EFFORT, REVIEW_EVIDENCE_MAX_BYTES, reviewText, type ReviewCandidate, type ReviewPolicy } from "./review-request.js";
import type { ReviewAudit } from "./review-controller.js";
import type { ReviewBinding, ReviewEvidence } from "./review-evidence.js";

export interface NativeProvenance {
  assurance: "native-session-configuration"; effectiveExecution: null;
  sourceDigest: string; candidateDigest: string; packetDigest: string; outputDigest: string;
  runtimeProofDigest: string; approvalDigest: string; binaryDigest: string; configurationDigest: string;
  native: {
    runtime: "0.151.0"; threadId: string; turnId: string;
    requested: { model: string; effort: string };
    observed: { model: string; effort: string; provider: "openai"; accountType: "chatgpt" };
    access: "read-only"; freshContext: true; terminationConfirmed: true;
  };
}

export function validateNativeProvenance(value: unknown, binding: ReviewBinding): NativeProvenance {
  const p = reviewObject(value);
  reviewKeys(p, ["assurance", "effectiveExecution", "sourceDigest", "candidateDigest", "packetDigest", "outputDigest",
    "runtimeProofDigest", "approvalDigest", "binaryDigest", "configurationDigest", "native"]);
  if (p.assurance !== "native-session-configuration" || p.effectiveExecution !== null
    || binding.model !== REVIEW_MODEL || binding.effort !== REVIEW_EFFORT) throw new Error("Native assurance rejected");
  for (const key of ["sourceDigest", "candidateDigest", "packetDigest", "outputDigest", "runtimeProofDigest", "approvalDigest", "binaryDigest", "configurationDigest"]) {
    reviewMatch(p[key], /^[a-f0-9]{64}$/);
  }
  const n = reviewObject(p.native);
  reviewKeys(n, ["runtime", "threadId", "turnId", "requested", "observed", "access", "freshContext", "terminationConfirmed"]);
  reviewId(n.threadId); reviewId(n.turnId);
  const requested = reviewObject(n.requested); const observed = reviewObject(n.observed);
  reviewKeys(requested, ["model", "effort"]); reviewKeys(observed, ["model", "effort", "provider", "accountType"]);
  if (n.runtime !== "0.151.0" || n.access !== "read-only" || n.freshContext !== true || n.terminationConfirmed !== true
    || requested.model !== binding.model || requested.effort !== binding.effort
    || observed.model !== binding.model || observed.effort !== binding.effort
    || observed.provider !== "openai" || observed.accountType !== "chatgpt") throw new Error("Native provenance rejected");
  return structuredClone(p) as unknown as NativeProvenance;
}

/** Only the controller calls this after revalidating its immutable audit/intent
 * against current protected candidate, source proof and policy under one lock.
 * No signing/publication capability or model-authored provenance enters here. */
export function prepareNativeEvidence(audit: ReviewAudit, candidate: ReviewCandidate, policy: ReviewPolicy, runtimeRaw: string, now: number): ReviewEvidence {
  const acceptance = policy.acceptance;
  if (policy.schemaVersion !== 2 || candidate.schemaVersion !== 2 || !acceptance
    || hashReviewBytes(runtimeRaw) !== candidate.runtimeProofDigest) throw new Error("Native acceptance is not authorized");
  const runtime = parseReviewJson(runtimeRaw, 65536);
  reviewKeys(runtime, ["schemaVersion", "policyDigest", "workerHostId", "executorHostId", "runtime", "binaryDigest", "configurationDigest", "checkedAt", "expiresAt", "terminationConfirmed", "checks"]);
  if (runtime.schemaVersion !== 1 || runtime.policyDigest !== candidate.binding.policyDigest
    || runtime.workerHostId !== candidate.binding.reviewerHostId || runtime.executorHostId !== policy.proofHostId
    || runtime.runtime !== acceptance.runtime || runtime.binaryDigest !== acceptance.binaryDigest
    || runtime.configurationDigest !== acceptance.configurationDigest || runtime.terminationConfirmed !== true) throw new Error("Runtime proof rejected");
  validateReviewChecks(acceptance.requiredRuntimeChecks, runtime.checks);
  for (const value of [now, runtime.checkedAt, runtime.expiresAt]) {
    if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new Error("Runtime proof clock rejected");
  }
  if (Number(runtime.checkedAt) > audit.issuedAt || Number(runtime.checkedAt) > now
    || Number(runtime.expiresAt) <= now || Number(runtime.expiresAt) <= Number(runtime.checkedAt)
    || Number(runtime.expiresAt) - Number(runtime.checkedAt) > 1800000) throw new Error("Runtime proof is stale");
  if (Object.values(audit.verdicts).some(value => value !== "pass") || audit.findings.some(value => {
    const finding = reviewObject(value);
    return finding.priority !== 3 || typeof finding.disposition !== "string" || !finding.disposition.trim() || finding.disposition.length > 1000;
  })) throw new Error("Review did not pass");
  const expiresAt = Math.min(audit.issuedAt + 1800000, Number(runtime.expiresAt));
  if (audit.issuedAt > now || expiresAt <= now) throw new Error("Review is stale");
  const native = audit.native;
  const provenance = validateNativeProvenance({
    assurance: "native-session-configuration", effectiveExecution: null,
    sourceDigest: candidate.sourceDigest, candidateDigest: audit.candidateDigest,
    packetDigest: audit.packetDigest, outputDigest: audit.outputDigest,
    runtimeProofDigest: candidate.runtimeProofDigest, approvalDigest: acceptance.approvalDigest,
    binaryDigest: acceptance.binaryDigest, configurationDigest: acceptance.configurationDigest,
    native: Object.fromEntries(["runtime", "threadId", "turnId", "requested", "observed", "access", "freshContext", "terminationConfirmed"].map(key => [key, native[key]])),
  }, candidate.binding);
  const evidence: ReviewEvidence = { ...candidate.binding, schemaVersion: 2, executionId: audit.executionId, issuedAt: audit.issuedAt,
    expiresAt, access: "read-only", verdicts: { standards: "pass", spec: "pass", proof: "pass", overall: "pass" },
    findings: structuredClone(audit.findings) as ReviewEvidence["findings"], provenance };
  reviewText(JSON.stringify(evidence), REVIEW_EVIDENCE_MAX_BYTES);
  return evidence;
}
