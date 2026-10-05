import { createHash } from "node:crypto";
import { githubRestRequest } from "./core.js";
import { withinDeadline } from "./deadline.js";
import { createReviewerFetch } from "./reviewer-transport.js";
import { copyPublisherPolicy, validateReviewVetoes, type PublisherPolicy, type PublicationRecord } from "./review-publisher.js";
import { verifyReviewEvidence, type ReviewBinding } from "./review-evidence.js";

export interface MergeReadinessPolicy extends PublisherPolicy {
  requirePrivate: boolean;
  policyDigest: string;
}
export interface MergeReadinessDependencies {
  loadRequest: (requestId: string) => Promise<{ binding: ReviewBinding; envelope: unknown; risk: string }>;
  inspectPublication: (requestId: string) => Promise<PublicationRecord>;
  mergeEnabled: () => Promise<boolean>;
  readTokenForRepository: (repositoryId: number) => Promise<string>;
  fetchImpl?: typeof fetch;
  now?: () => number;
}
// This is a fixed query, not an author-provided GraphQL operation.
const REVIEW_STATE_QUERY = `query ReviewMergeReadiness($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    databaseId isPrivate
    pullRequest(number: $number) {
      number state isDraft baseRefName baseRefOid headRefOid isCrossRepository
      mergeable mergeStateStatus reviewDecision
      reviewThreads(first: 100) { totalCount nodes { isResolved } pageInfo { hasNextPage } }
    }
  }
}`;

export function createMergeReadiness(policy: MergeReadinessPolicy, deps: MergeReadinessDependencies) {
  const settings = { ...copyPublisherPolicy(policy), requirePrivate: policy.requirePrivate, policyDigest: policy.policyDigest };
  if (typeof settings.requirePrivate !== "boolean" || !/^[a-f0-9]{64}$/.test(settings.policyDigest)) {
    throw new Error("Invalid merge-readiness policy");
  }
  const clock = deps.now ?? Date.now;
  const fetchImpl = createReviewerFetch(deps.fetchImpl);
  const enabled = async () => {
    if (await withinDeadline(deps.mergeEnabled, 30_000) !== true) throw new Error("Merge disabled");
  };
  return {
    async inspect(requestId: string) {
      try {
        if (!/^[A-Za-z0-9_-]{1,100}$/.test(requestId)) throw new Error("Invalid request ID");
        await enabled();
        const loaded = structuredClone(await withinDeadline(() => deps.loadRequest(requestId), 30_000));
        if (!["low", "medium"].includes(loaded.risk)) throw new Error("Risk requires specific human acceptance");
        const binding = loaded.binding;
        const evidence = verifyReviewEvidence(loaded.envelope, settings.evidenceKey, binding, clock());
        if (binding.model !== settings.model || binding.effort !== settings.effort
          || binding.reviewerHostId !== settings.reviewerHostId || binding.policyDigest !== settings.policyDigest) {
          throw new Error("Merge policy mismatch");
        }
        const repo = settings.repositories.find(item => item.id === binding.repositoryId);
        if (!repo) throw new Error("Repository not allowed");
        const operationId = createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
        const publication = async () => {
          const record = await withinDeadline(() => deps.inspectPublication(requestId), 30_000);
          if (record.phase !== "complete" || record.operationId !== operationId || "auditOnly" in record) {
            throw new Error("Current publication not verified");
          }
          return record;
        };
        const first = structuredClone(await publication());
        const root = `/repos/${repo.owner}/${repo.repo}`;
        const read = async (path: string, body?: Record<string, unknown>) => {
          const result = await githubRestRequest({ method: body ? "POST" : "GET", path,
            ...(body ? { body, confirm_write: true } : {}) }, {
            env: {}, fetchImpl, tokenProvider: () => deps.readTokenForRepository(repo.id),
          });
          return result.response;
        };
        const repository = object(await read(root));
        if (repository.id !== repo.id || repository.full_name !== `${repo.owner}/${repo.repo}`
          || repository.private !== settings.requirePrivate || repository.archived !== false || repository.disabled !== false) {
          throw new Error("Repository identity or state changed");
        }
        const branchPath = `${root}/branches/${encodeURIComponent(repo.baseBranch)}`;
        const protectedBase = async () => {
          const branch = object(await read(branchPath));
          if (branch.name !== repo.baseBranch || branch.protected !== true || object(branch.commit).sha !== binding.baseSha) {
            throw new Error("Protected base changed");
          }
          validateProtection(await read(`${branchPath}/protection`), settings.appId);
        };
        await protectedBase();
        const comparison = object(await read(`${root}/compare/${binding.baseSha}...${binding.headSha}`));
        if (!["ahead", "identical"].includes(String(comparison.status)) || comparison.behind_by !== 0
          || object(comparison.base_commit).sha !== binding.baseSha || object(comparison.merge_base_commit).sha !== binding.baseSha) {
          throw new Error("Candidate does not include current base");
        }
        const reviewState = async () => {
          const response = object(await read("/graphql", { query: REVIEW_STATE_QUERY,
            variables: { owner: repo.owner, repo: repo.repo, number: binding.pullNumber } }));
          if (response.errors !== undefined) throw new Error("Incomplete GraphQL response");
          const result = object(object(response.data).repository);
          if (result.databaseId !== repo.id || result.isPrivate !== settings.requirePrivate) throw new Error("GraphQL repository mismatch");
          validatePull(result.pullRequest, binding, repo.baseBranch);
          validateReviewVetoes(await read(`${root}/pulls/${binding.pullNumber}/reviews?per_page=100`));
        };
        await reviewState();
        const final = await publication();
        if (final.reviewId !== first.reviewId || JSON.stringify(final.checkIds) !== JSON.stringify(first.checkIds)) {
          throw new Error("Publication changed during inspection");
        }
        await protectedBase();
        await reviewState();
        await enabled();
        const observedAt = clock();
        verifyReviewEvidence(loaded.envelope, settings.evidenceKey, binding, observedAt);
        return { status: "ready-at-observation" as const, mergeAuthorized: false as const,
          repositoryId: repo.id, pullNumber: binding.pullNumber, baseSha: binding.baseSha,
          headSha: binding.headSha, operationId, policyDigest: settings.policyDigest, observedAt };
      } catch {
        throw new Error("Merge readiness rejected; current authority, rules, revisions and acceptance must all be verified");
      }
    },
  };
}

function validateProtection(value: unknown, appId: number): void {
  const protection = object(value);
  for (const name of ["enforce_admins", "required_conversation_resolution"]) {
    if (object(protection[name]).enabled !== true) throw new Error("Required protection missing");
  }
  for (const name of ["allow_force_pushes", "allow_deletions", "lock_branch"]) {
    if (object(protection[name]).enabled !== false) throw new Error("Unsafe or frozen branch");
  }
  const status = object(protection.required_status_checks);
  if (status.strict !== true || !Array.isArray(status.checks) || status.checks.length > 100) throw new Error("Strict checks missing");
  for (const name of ["rudi/review", "rudi/proof"]) {
    const matches = status.checks.map(object).filter(check => check.context === name);
    if (matches.length !== 1 || matches[0].app_id !== appId) throw new Error("Acceptance check not App-pinned");
  }
  const reviews = object(protection.required_pull_request_reviews);
  const count = reviews.required_approving_review_count;
  if (reviews.dismiss_stale_reviews !== true || typeof count !== "number" || !Number.isSafeInteger(count) || count < 1) {
    throw new Error("Required native approval missing");
  }
  // GitHub may omit allowances when none are configured; any returned allowance must be empty.
  if (reviews.bypass_pull_request_allowances !== undefined) {
    const bypass = object(reviews.bypass_pull_request_allowances);
    for (const [name, actors] of Object.entries(bypass)) {
      if (!["users", "teams", "apps"].includes(name) || !Array.isArray(actors) || actors.length) throw new Error("Review bypass configured");
    }
  }
}

function validatePull(value: unknown, binding: ReviewBinding, branch: string): void {
  const pr = object(value);
  if (pr.number !== binding.pullNumber || pr.state !== "OPEN" || pr.isDraft !== false || pr.isCrossRepository !== false
    || pr.baseRefName !== branch || pr.baseRefOid !== binding.baseSha || pr.headRefOid !== binding.headSha
    || pr.mergeable !== "MERGEABLE" || pr.mergeStateStatus !== "CLEAN" || pr.reviewDecision !== "APPROVED") {
    throw new Error("Pull request is not currently ready");
  }
  const threads = object(pr.reviewThreads);
  if (!Array.isArray(threads.nodes) || threads.nodes.length > 100 || threads.totalCount !== threads.nodes.length
    || object(threads.pageInfo).hasNextPage !== false || threads.nodes.some(thread => object(thread).isResolved !== true)) {
    throw new Error("Unresolved or incomplete discussion history");
  }
}


function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid API object");
  return value as Record<string, unknown>;
}
