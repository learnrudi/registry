import { createHash } from "node:crypto";
import type { ReviewBinding } from "./review-evidence.js";

export const REVIEW_MODEL = "gpt-6-astra";
export const REVIEW_EFFORT = "xhigh";
// One decoded JSON byte limit for preparation and signature verification. Allows
// the 128 KiB native verdict output plus bounded provenance/envelope metadata.
export const REVIEW_EVIDENCE_MAX_BYTES = 196608;
export const hashReviewBytes = (text: string): string => createHash("sha256").update(text).digest("hex");
export interface ReviewCandidate {
  schemaVersion: 1 | 2; binding: ReviewBinding; sourceDigest: string; contractText: string; sourceText: string;
  runtimeProofDigest?: string;
}
export interface NativeAcceptancePolicy {
  assurance: "native-session-configuration"; approvalDigest: string; runtime: "0.151.0";
  binaryDigest: string; configurationDigest: string; requiredRuntimeChecks: { id: string; commandDigest: string }[];
}
export const RUNTIME_CHECKS = ["runtime-custody", "configuration-custody", "worker-isolation", "process-confinement", "credential-separation"];
export interface ReviewPolicy {
  schemaVersion: 1 | 2; enabled: boolean; repositoryIds: number[]; model: string; effort: string;
  reviewerHostId: string; proofHostId: string; requiredChecks: { id: string; commandDigest: string }[];
  acceptance?: NativeAcceptancePolicy;
}
export function reviewObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid review object");
  return value as Record<string, unknown>;
}
export function reviewKeys(value: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw new Error("Invalid review fields");
}
export function reviewText(value: unknown, max: number): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.includes("\0") || Buffer.byteLength(value) > max) throw new Error("Invalid review text");
}
export function reviewMatch(value: unknown, pattern: RegExp): void {
  if (typeof value !== "string" || !pattern.test(value)) throw new Error("Invalid review identifier");
}
export function reviewId(value: unknown): void { reviewMatch(value, /^[A-Za-z0-9_-]{1,100}$/); }
export function parseReviewJson(raw: string, max = 600000): Record<string, unknown> {
  reviewText(raw, max); return reviewObject(JSON.parse(raw));
}
export function parseReviewCandidate(raw: string): ReviewCandidate {
  const c = parseReviewJson(raw);
  reviewKeys(c, ["schemaVersion", "binding", "sourceDigest", "contractText", "sourceText", ...(c.schemaVersion === 2 ? ["runtimeProofDigest"] : [])]);
  const b = reviewObject(c.binding);
  reviewKeys(b, ["repositoryId", "pullNumber", "baseSha", "headSha", "contractDigest", "proofDigest", "policyDigest", "model", "effort", "reviewerHostId", "authorHostId"]);
  if (![1, 2].includes(Number(c.schemaVersion)) || typeof c.schemaVersion !== "number" || b.model !== REVIEW_MODEL || b.effort !== REVIEW_EFFORT || b.authorHostId === b.reviewerHostId) throw new Error("Invalid review contract");
  if (c.schemaVersion === 2) reviewMatch(c.runtimeProofDigest, /^[a-f0-9]{64}$/);
  for (const key of ["repositoryId", "pullNumber"]) {
    if (!Number.isSafeInteger(b[key]) || Number(b[key]) <= 0) throw new Error("Invalid repository identity");
  }
  for (const key of ["baseSha", "headSha"]) reviewMatch(b[key], /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);
  for (const key of ["contractDigest", "proofDigest", "policyDigest"]) reviewMatch(b[key], /^[a-f0-9]{64}$/);
  for (const key of ["reviewerHostId", "authorHostId"]) reviewMatch(b[key], /^[A-Za-z0-9_.:-]{1,128}$/);
  reviewText(c.contractText, 65536); reviewText(c.sourceText, 393216);
  if (hashReviewBytes(c.contractText) !== b.contractDigest || hashReviewBytes(c.sourceText) !== c.sourceDigest) throw new Error("Review bytes changed");
  return c as unknown as ReviewCandidate;
}
export function validateReviewAuthority(candidate: ReviewCandidate, policyRaw: string, proofRaw: string): ReviewPolicy {
  const b = candidate.binding;
  if (hashReviewBytes(policyRaw) !== b.policyDigest || hashReviewBytes(proofRaw) !== b.proofDigest) throw new Error("Authority changed");
  const p = parseReviewJson(policyRaw, 65536);
  reviewKeys(p, ["schemaVersion", "enabled", "repositoryIds", "model", "effort", "reviewerHostId", "proofHostId", "requiredChecks", ...(p.schemaVersion === 2 ? ["acceptance"] : [])]);
  if (p.schemaVersion !== candidate.schemaVersion || p.enabled !== true || p.model !== REVIEW_MODEL || p.effort !== REVIEW_EFFORT
    || p.reviewerHostId !== b.reviewerHostId || !Array.isArray(p.repositoryIds) || !p.repositoryIds.length
    || p.repositoryIds.length > 1000 || p.repositoryIds.some(id => !Number.isSafeInteger(id) || id <= 0)
    || new Set(p.repositoryIds).size !== p.repositoryIds.length || !p.repositoryIds.includes(b.repositoryId)) throw new Error("Review policy rejected");
  reviewMatch(p.proofHostId, /^[A-Za-z0-9_.:-]{1,128}$/);
  if (p.proofHostId === b.authorHostId || p.proofHostId === b.reviewerHostId) throw new Error("Proof authority not independent");
  if (p.schemaVersion === 2) validateAcceptancePolicy(p.acceptance);
  const proof = parseReviewJson(proofRaw, 65536);
  reviewKeys(proof, ["schemaVersion", "repositoryId", "baseSha", "headSha", "contractDigest", "sourceDigest", "policyDigest", "executorHostId", "terminationConfirmed", "checks"]);
  if (proof.schemaVersion !== 1 || proof.terminationConfirmed !== true || proof.executorHostId !== p.proofHostId
    || ["repositoryId", "baseSha", "headSha", "contractDigest", "policyDigest"].some(key => proof[key] !== b[key as keyof ReviewBinding])
    || proof.sourceDigest !== candidate.sourceDigest) throw new Error("Proof binding rejected");
  validateReviewChecks(p.requiredChecks, proof.checks);
  return p as unknown as ReviewPolicy;
}
function validateAcceptancePolicy(value: unknown): void {
  const p = reviewObject(value);
  reviewKeys(p, ["assurance", "approvalDigest", "runtime", "binaryDigest", "configurationDigest", "requiredRuntimeChecks"]);
  if (p.assurance !== "native-session-configuration" || p.runtime !== "0.151.0") throw new Error("Native acceptance policy rejected");
  for (const key of ["approvalDigest", "binaryDigest", "configurationDigest"]) reviewMatch(p[key], /^[a-f0-9]{64}$/);
  if (!Array.isArray(p.requiredRuntimeChecks) || p.requiredRuntimeChecks.length !== RUNTIME_CHECKS.length) throw new Error("Runtime checks missing");
  for (const [index, value] of p.requiredRuntimeChecks.entries()) {
    const check = reviewObject(value); reviewKeys(check, ["id", "commandDigest"]);
    if (check.id !== RUNTIME_CHECKS[index]) throw new Error("Runtime check rejected");
    reviewMatch(check.commandDigest, /^[a-f0-9]{64}$/);
  }
}
export function validateReviewChecks(required: unknown, observed: unknown): void {
  if (!Array.isArray(required) || !required.length || required.length > 100 || !Array.isArray(observed) || observed.length !== required.length) throw new Error("Proof checks missing");
  const seen = new Set();
  for (const [index, entry] of required.entries()) {
    const wanted = reviewObject(entry); const actual = reviewObject(observed[index]);
    reviewKeys(wanted, ["id", "commandDigest"]); reviewKeys(actual, ["id", "commandDigest", "exitCode", "outputDigest"]);
    reviewId(wanted.id); reviewMatch(wanted.commandDigest, /^[a-f0-9]{64}$/); reviewMatch(actual.outputDigest, /^[a-f0-9]{64}$/);
    if (seen.has(wanted.id) || actual.id !== wanted.id || actual.commandDigest !== wanted.commandDigest || actual.exitCode !== 0) throw new Error("Proof check failed");
    seen.add(wanted.id);
  }
}
