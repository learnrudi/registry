import { nativeProvenance } from './fixtures/native-acceptance.mjs';
import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { verifyReviewEvidence } from "../dist/review-evidence.js";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const now = Date.parse("2026-10-03T12:00:00Z");
const binding = { repositoryId: 101, pullNumber: 7, baseSha: "a".repeat(40), headSha: "b".repeat(40), contractDigest: "c".repeat(64), proofDigest: "d".repeat(64), policyDigest: "e".repeat(64), model: "gpt-6-astra", effort: "xhigh", reviewerHostId: "isolated-review-host", authorHostId: "author-host" };
const evidence = { ...binding, schemaVersion: 2, provenance: nativeProvenance(), executionId: "execution-123", reviewerHostId: "isolated-review-host", authorHostId: "author-host", issuedAt: now - 1000, expiresAt: now + 300000, access: "read-only", verdicts: { standards: "pass", spec: "pass", proof: "pass", overall: "pass" }, findings: [] };
function envelope(value, key = privateKey) {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return { payload, signature: sign(null, Buffer.from(payload), key).toString("base64url") };
}

test("accepts host-signed evidence only for the bound review contract and revisions", () => {
  assert.deepEqual(verifyReviewEvidence(envelope(evidence), publicKey, binding, now), evidence);
});

test("rejects forged signatures and altered payloads", () => {
  const other = generateKeyPairSync("ed25519");
  const forged = envelope(evidence, other.privateKey);
  assert.throws(() => verifyReviewEvidence(forged, publicKey, binding, now), /Review evidence rejected/);
  const altered = { ...envelope(evidence), payload: envelope({ ...evidence, headSha: "f".repeat(40) }).payload };
  assert.throws(() => verifyReviewEvidence(altered, publicKey, binding, now), /Review evidence rejected/);
});

test("rejects stale, mismatched, non-independent, incomplete and failing evidence", () => {
  const patches = [
    { repositoryId: 102 }, { pullNumber: 8 }, { headSha: "f".repeat(40) },
    { baseSha: "f".repeat(40) }, { contractDigest: "f".repeat(64) },
    { proofDigest: "f".repeat(64) }, { policyDigest: "f".repeat(64) },
    { model: "another-model" }, { effort: "low" }, { access: "write" },
    { reviewerHostId: "author-host" }, { reviewerHostId: "unexpected-host" },
    { issuedAt: now + 60000 }, { expiresAt: now - 1 },
    { expiresAt: now + 3600000 }, { schemaVersion: 1 },
    { verdicts: { ...evidence.verdicts, proof: "blocked" } },
    { findings: [{ priority: 2, disposition: "ignore" }] },
    { findings: [{ priority: 3, disposition: "" }] }, { unexpected: true },
  ];
  for (const patch of patches) {
    assert.throws(() => verifyReviewEvidence(envelope({ ...evidence, ...patch }), publicKey, binding, now), /Review evidence rejected/);
  }
  const missing = { ...evidence }; delete missing.executionId;
  assert.throws(() => verifyReviewEvidence(envelope(missing), publicKey, binding, now), /Review evidence rejected/);
});

test("allows only bounded, dispositioned P3 findings", () => {
  const accepted = { ...evidence, findings: [{ priority: 3, disposition: "Tracked for the next maintenance release; no acceptance impact." }] };
  assert.deepEqual(verifyReviewEvidence(envelope(accepted), publicKey, binding, now), accepted);
});

for(const [name,mutate] of [
  ['missing provenance',e=>{delete e.provenance;}],
  ['claimed provider attestation',e=>{e.provenance.effectiveExecution={model:'gpt-6-astra'};}],
  ['wrong effort',e=>{e.provenance.native.observed.effort='low';}],
  ['API billing',e=>{e.provenance.native.observed.accountType='apiKey';}],
  ['reused context',e=>{e.provenance.native.freshContext=false;}],
  ['unconfirmed termination',e=>{e.provenance.native.terminationConfirmed=false;}],
  ['missing owner approval',e=>{delete e.provenance.approvalDigest;}],
])test(`signed evidence rejects ${name}`,()=>{
  const value=structuredClone(evidence);mutate(value);
  assert.throws(()=>verifyReviewEvidence(envelope(value),publicKey,binding,now),/rejected/);
});

test('signed evidence retains a finite decoded UTF-8 size bound',()=>{
  const oversized={...evidence,findings:Array.from({length:100},()=>({priority:3,disposition:'界'.repeat(1000)}))};
  assert.throws(()=>verifyReviewEvidence(envelope(oversized),publicKey,binding,now),/rejected/);
});
