import { verify, type KeyObject } from "node:crypto";
import { validateNativeProvenance, type NativeProvenance } from "./native-acceptance.js";
import { REVIEW_EVIDENCE_MAX_BYTES } from "./review-request.js";

export interface ReviewBinding {
  repositoryId: number;
  pullNumber: number;
  baseSha: string;
  headSha: string;
  contractDigest: string;
  proofDigest: string;
  policyDigest: string;
  model: string;
  effort: string;
  reviewerHostId: string;
  authorHostId: string;
}

export interface ReviewEvidence extends ReviewBinding {
  schemaVersion: 2;
  executionId: string;
  issuedAt: number;
  expiresAt: number;
  access: "read-only";
  verdicts: { standards: "pass"; spec: "pass"; proof: "pass"; overall: "pass" };
  findings: { priority: 0 | 1 | 2 | 3; disposition: string }[];
  provenance: NativeProvenance;
}

export interface SignedReviewEvidence { payload: string; signature: string }

export function verifyReviewEvidence(
  envelope: unknown, key: KeyObject, binding: ReviewBinding, now: number,
  purpose: "publication" | "historical-reconciliation" = "publication",
): ReviewEvidence {
  try {
    const signed = object(envelope);
    exactKeys(signed, ["payload", "signature"]);
    const payload = encoded(signed.payload, Math.ceil(REVIEW_EVIDENCE_MAX_BYTES * 4 / 3));
    const payloadBytes = Buffer.from(payload, "base64url");
    if (payloadBytes.length > REVIEW_EVIDENCE_MAX_BYTES) throw new Error("Oversized evidence");
    const signature = encoded(signed.signature, 86);
    if (key.type !== "public" || key.asymmetricKeyType !== "ed25519"
      || Buffer.from(signature, "base64url").length !== 64
      || !verify(null, Buffer.from(payload), key, Buffer.from(signature, "base64url"))) {
      throw new Error("Untrusted signature");
    }
    const data = object(JSON.parse(payloadBytes.toString("utf8")));
    validateEvidence(data, now, purpose);
    const bound = ["repositoryId", "pullNumber", "baseSha", "headSha", "contractDigest",
      "proofDigest", "policyDigest", "model", "effort", "reviewerHostId", "authorHostId"] as const;
    if (bound.some(name => data[name] !== binding[name])) throw new Error("Evidence binding mismatch");
    // Data has been parsed into a fresh object; retain no caller-mutable reference.
    return data as unknown as ReviewEvidence;
  } catch {
    throw new Error("Review evidence rejected");
  }
}

function validateEvidence(data: Record<string, unknown>, now: number, purpose: string): void {
  if (!["publication", "historical-reconciliation"].includes(purpose)) throw new Error("Invalid verification purpose");
  exactKeys(data, ["schemaVersion", "repositoryId", "pullNumber", "baseSha", "headSha",
    "contractDigest", "proofDigest", "policyDigest", "model", "effort", "executionId",
    "reviewerHostId", "authorHostId", "issuedAt", "expiresAt", "access", "verdicts", "findings", "provenance"]);
  if (data.schemaVersion !== 2 || data.access !== "read-only") throw new Error("Unsupported evidence");
  validateNativeProvenance(data.provenance, data as unknown as ReviewBinding);
  for (const name of ["repositoryId", "pullNumber"]) positiveInteger(data[name]);
  for (const name of ["baseSha", "headSha"]) match(data[name], /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);
  for (const name of ["contractDigest", "proofDigest", "policyDigest"]) match(data[name], /^[a-f0-9]{64}$/);
  for (const name of ["model", "effort", "executionId", "reviewerHostId", "authorHostId"]) {
    match(data[name], /^[A-Za-z0-9_.:-]{1,128}$/);
  }
  if (data.reviewerHostId === data.authorHostId) throw new Error("Reviewer is not independent");
  positiveInteger(now);
  positiveInteger(data.issuedAt);
  positiveInteger(data.expiresAt);
  const issued = data.issuedAt as number;
  const expires = data.expiresAt as number;
  if (issued > now + 30_000 || (purpose === "publication" && expires <= now) || expires <= issued
    || expires - issued > 1_800_000) throw new Error("Stale evidence");
  const verdicts = object(data.verdicts);
  exactKeys(verdicts, ["standards", "spec", "proof", "overall"]);
  if (Object.values(verdicts).some(value => value !== "pass")) throw new Error("Review did not pass");
  if (!Array.isArray(data.findings) || data.findings.length > 100) throw new Error("Invalid findings");
  for (const item of data.findings) {
    const finding = object(item);
    exactKeys(finding, ["priority", "disposition"]);
    if (finding.priority !== 3 || typeof finding.disposition !== "string"
      || !finding.disposition.trim() || finding.disposition.length > 1000) {
      throw new Error("Unresolved finding");
    }
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid object");
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, names: string[]): void {
  if (Object.keys(value).length !== names.length || names.some(name => !Object.hasOwn(value, name))) {
    throw new Error("Unexpected evidence fields");
  }
}

function positiveInteger(value: unknown): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new Error("Invalid integer");
}

function match(value: unknown, pattern: RegExp): void {
  if (typeof value !== "string" || !pattern.test(value)) throw new Error("Invalid identifier");
}

function encoded(value: unknown, maxLength: number): string {
  match(value, /^[A-Za-z0-9_-]+$/);
  const text = value as string;
  if (text.length > maxLength || Buffer.from(text, "base64url").toString("base64url") !== text) {
    throw new Error("Invalid encoding");
  }
  return text;
}
