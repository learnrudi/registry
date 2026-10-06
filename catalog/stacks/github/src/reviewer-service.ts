import { createPublicKey, sign, type KeyObject } from "node:crypto";
import { withinDeadline } from "./deadline.js";
import { reviewId } from "./review-request.js";
import { verifyReviewEvidence, type ReviewBinding, type ReviewEvidence, type SignedReviewEvidence } from "./review-evidence.js";

export interface AcceptedReview { binding: ReviewBinding; envelope: SignedReviewEvidence }
export interface AcceptanceSignerDependencies {
  prepareAcceptance(id: string, options: { signal?: AbortSignal }): Promise<ReviewEvidence>;
  privateKey(): Promise<KeyObject>;
  enabled(): Promise<boolean>;
  // Protected create-only persistence must reject a different prior value. This
  // boundary is never exposed to the reviewer, author or a generic MCP tool.
  writeAccepted(id: string, value: AcceptedReview): Promise<void>;
  now?: () => number;
}
/** Separate trusted signer. Its sole caller input is an opaque request ID;
 * unsigned evidence is obtained from the canonical protected controller. */
export function createAcceptanceSigner(deps: AcceptanceSignerDependencies) {
  return { async prepare(id: string, options: { signal?: AbortSignal } = {}) {
    let active = true;
    const guard = async () => {
      if (!active || options.signal?.aborted || await withinDeadline(deps.enabled, 30000) !== true
        || !active || options.signal?.aborted) throw new Error("Signer disabled");
    };
    try {
      reviewId(id); await guard();
      const evidence = structuredClone(await deps.prepareAcceptance(id, options));
      await guard();
      const key = await withinDeadline(deps.privateKey, 30000); await guard();
      if (key.type !== "private" || key.asymmetricKeyType !== "ed25519") throw new Error("Wrong signing key");
      const binding = Object.fromEntries(["repositoryId", "pullNumber", "baseSha", "headSha", "contractDigest", "proofDigest", "policyDigest",
        "model", "effort", "reviewerHostId", "authorHostId"].map(name => [name, evidence[name as keyof ReviewEvidence]])) as unknown as ReviewBinding;
      const payload = Buffer.from(JSON.stringify(evidence)).toString("base64url");
      const envelope = { payload, signature: sign(null, Buffer.from(payload), key).toString("base64url") };
      verifyReviewEvidence(envelope, createPublicKey(key), binding, (deps.now ?? Date.now)());
      await guard();
      verifyReviewEvidence(envelope, createPublicKey(key), binding, (deps.now ?? Date.now)());
      await withinDeadline(() => deps.writeAccepted(id, { binding, envelope }), 30000);
      await guard();
      return { status: "signed" as const, publication: null, mergeAuthorized: false as const };
    } catch { throw new Error("Acceptance signing rejected"); }
    finally { active = false; }
  } };
}
