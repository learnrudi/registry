import { createHash, type KeyObject } from "node:crypto";
import { githubRestRequest } from "./core.js";
import { createReviewerFetch } from "./reviewer-transport.js";
import { verifyReviewEvidence, type ReviewBinding } from "./review-evidence.js";

const ASSURANCE_TEXT = "Assurance: verified native session configuration. Effective provider execution is not attested.";

export interface PublicationRecord {
  phase: "uncertain" | "complete";
  operationId: string;
  checkIds?: number[];
  reviewId?: number;
}
export interface PublicationJournal {
  withLock<T>(key: string, operation: () => Promise<T>): Promise<T>;
  read(key: string): Promise<PublicationRecord | undefined>;
  write(key: string, record: PublicationRecord): Promise<void>;
}
export interface PublisherPolicy {
  appId: number;
  botUserId: number;
  repositories: { id: number; owner: string; repo: string; baseBranch: string }[];
  evidenceKey: KeyObject;
  model: string;
  effort: string;
  reviewerHostId: string;
}
export interface PublisherDependencies {
  loadRequest: (requestId: string) => Promise<{ binding: ReviewBinding; envelope: unknown }>;
  enabled: () => Promise<boolean>;
  tokenForRepository: (repositoryId: number) => Promise<string>;
  journal: PublicationJournal;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export function createReviewPublisher(policy: PublisherPolicy, deps: PublisherDependencies) {
  const settings = copyPublisherPolicy(policy);
  const clock = deps.now ?? Date.now;
  const fetchImpl = createReviewerFetch(deps.fetchImpl);
  const enabled = async () => {
    if (await deps.enabled() !== true) throw new Error("Publication disabled");
  };
  const run = async (requestId: string, mode: "publish" | "inspect" | "reconcile"): Promise<PublicationRecord> => {
    const reconcile = mode === "reconcile";
    try {
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(requestId)) throw new Error("Invalid request ID");
      if (!reconcile) await enabled();
      // Only the isolated service loads accepted requests; this is not a tool argument.
      const loaded = await deps.loadRequest(requestId);
      const binding = { ...loaded.binding };
      const envelope: unknown = structuredClone(loaded.envelope);
      const evidence = verifyReviewEvidence(envelope, settings.evidenceKey, binding, clock(),
        reconcile ? "historical-reconciliation" : "publication");
      const repo = settings.repositories.find(item => item.id === binding.repositoryId);
      if (!repo || binding.model !== settings.model || binding.effort !== settings.effort
        || binding.reviewerHostId !== settings.reviewerHostId) throw new Error("Policy mismatch");
      const operationId = createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
      const root = `/repos/${repo.owner}/${repo.repo}`;
      const api = async (method: "GET" | "POST" | "PATCH", path: string, body?: Record<string, unknown>) => {
        if (method !== "GET") {
          await enabled();
          verifyReviewEvidence(envelope, settings.evidenceKey, binding, clock());
        }
        const result = await githubRestRequest({ method, path, body, confirm_write: method !== "GET" }, {
          env: {}, fetchImpl: async (url, init) => {
            // Authentication may await a token refresh. Recheck immediately before dispatch.
            if (method !== "GET") {
              await current();
              await enabled();
              verifyReviewEvidence(envelope, settings.evidenceKey, binding, clock());
            }
            return fetchImpl(url, init);
          },
          tokenProvider: () => deps.tokenForRepository(repo.id),
        });
        return result.response;
      };
      const current = async () => {
        const pr = object(await api("GET", `${root}/pulls/${binding.pullNumber}`));
        validatePull(pr, binding, repo.baseBranch);
        const branch = object(await api("GET", `${root}/branches/${encodeURIComponent(repo.baseBranch)}`));
        if (object(branch.commit).sha !== binding.baseSha) throw new Error("Base advanced");
        validateReviewVetoes(await reviewHistory());
      };
      const reviewHistory = async () => {
        const reviews = await api("GET", `${root}/pulls/${binding.pullNumber}/reviews?per_page=100`);
        if (!Array.isArray(reviews) || reviews.length >= 100) throw new Error("Incomplete review history");
        return reviews.map(object);
      };
      const latestDecision = (reviews: Record<string, unknown>[]) => reviews.filter(review =>
        object(review.user).id === settings.botUserId
        && ["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(String(review.state))).at(-1);
      const readBack = async (record: PublicationRecord) => {
        if (record.checkIds?.length !== 2 || new Set(record.checkIds).size !== 2) throw new Error("Invalid check IDs");
        for (const [index, name] of ["rudi/review", "rudi/proof"].entries()) {
          const id = positiveId(record.checkIds[index]);
          const check = object(await api("GET", `${root}/check-runs/${id}`));
          validateCheck(check, settings.appId, binding.headSha, name, operationId, true);
          if (check.id !== id) throw new Error("Check ID mismatch");
        }
        const id = positiveId(record.reviewId);
        const review = object(await api("GET", `${root}/pulls/${binding.pullNumber}/reviews/${id}`));
        validateReview(review, binding.headSha, settings.botUserId, operationId);
        if (review.id !== id) throw new Error("Review ID mismatch");
        const latest = latestDecision(await reviewHistory());
        if (!latest || latest.id !== id) throw new Error("Review was superseded");
        validateReview(latest, binding.headSha, settings.botUserId, operationId);
        if (!reconcile) {
          const allChecks = object(await api("GET", `${root}/commits/${binding.headSha}/check-runs?filter=all&app_id=${settings.appId}&per_page=100`));
          if (!Array.isArray(allChecks.check_runs) || allChecks.total_count !== allChecks.check_runs.length
            || allChecks.check_runs.length > 100) throw new Error("Incomplete check history");
          if (allChecks.check_runs.map(object).some(check => object(check.app).id === settings.appId
            && ["rudi/review", "rudi/proof"].includes(String(check.name)) && check.status !== "completed")) {
            throw new Error("Competing check is pending");
          }
          const latestChecks = object(await api("GET", `${root}/commits/${binding.headSha}/check-runs?filter=latest&app_id=${settings.appId}&per_page=100`));
          if (!Array.isArray(latestChecks.check_runs) || latestChecks.total_count !== latestChecks.check_runs.length
            || latestChecks.check_runs.length > 100) throw new Error("Incomplete current check history");
          for (const [index, name] of ["rudi/review", "rudi/proof"].entries()) {
            const matches = latestChecks.check_runs.map(object).filter(check => check.name === name
              && object(check.app).id === settings.appId);
            if (matches.length !== 1 || matches[0].id !== record.checkIds[index]) throw new Error("Check was superseded");
            validateCheck(matches[0], settings.appId, binding.headSha, name, operationId, true);
          }
          await current();
        }
      };
      return await deps.journal.withLock(operationId, async () => {
        if (!reconcile) await current();
        const previous = await deps.journal.read(operationId);
        if (previous) {
          if (previous.operationId !== operationId) throw new Error("Journal identity mismatch");
          if (previous.phase === "complete") {
            await readBack(previous);
            return previous;
          }
          if (!reconcile) throw new Error("Prior write requires reconciliation");
          const result = object(await api("GET", `${root}/commits/${binding.headSha}/check-runs?filter=all&per_page=100`));
          if (!Array.isArray(result.check_runs) || result.total_count !== result.check_runs.length
            || result.check_runs.length > 100) throw new Error("Incomplete check history");
          const ids = ["rudi/review", "rudi/proof"].map(name => {
            const matches = (result.check_runs as unknown[]).map(object).filter(check =>
              check.name === name && check.external_id === operationId && object(check.app).id === settings.appId);
            if (matches.length !== 1) throw new Error("Ambiguous check history");
            validateCheck(matches[0], settings.appId, binding.headSha, name, operationId, true);
            return positiveId(matches[0].id);
          });
          const reviews = await reviewHistory();
          const matches = reviews.filter(review =>
            object(review.user).id === settings.botUserId && review.body === reviewBody(operationId));
          if (matches.length !== 1) throw new Error("Ambiguous review history");
          validateReview(matches[0], binding.headSha, settings.botUserId, operationId);
          const complete: PublicationRecord = { phase: "complete", operationId, checkIds: ids,
            reviewId: positiveId(matches[0].id) };
          await readBack(complete);
          await deps.journal.write(operationId, complete);
          return complete;
        }
        if (mode !== "publish") throw new Error("No existing publication to inspect");
        // Persist before the first mutation: crashes/timeouts must never auto-retry writes.
        await deps.journal.write(operationId, { phase: "uncertain", operationId });
        const checkIds: number[] = [];
        for (const name of ["rudi/review", "rudi/proof"]) {
          const check = object(await api("POST", `${root}/check-runs`, {
            name, head_sha: binding.headSha, status: "in_progress", external_id: operationId,
          }));
          validateCheck(check, settings.appId, binding.headSha, name, operationId, false);
          checkIds.push(positiveId(check.id));
        }
        await current();
        const review = object(await api("POST", `${root}/pulls/${binding.pullNumber}/reviews`, {
          commit_id: binding.headSha, event: "APPROVE",
          body: reviewBody(operationId),
        }));
        validateReview(review, binding.headSha, settings.botUserId, operationId);
        const reviewId = positiveId(review.id);
        await current();
        for (const [index, name] of ["rudi/review", "rudi/proof"].entries()) {
          await current();
          const latest = latestDecision(await reviewHistory());
          if (!latest || latest.id !== reviewId) throw new Error("Review was superseded");
          validateReview(latest, binding.headSha, settings.botUserId, operationId);
          const check = object(await api("PATCH", `${root}/check-runs/${checkIds[index]}`, {
            status: "completed", conclusion: "success",
            output: { title: "Independent acceptance passed", summary:
              `Evidence: ${operationId}\nBase: ${binding.baseSha}\nHead: ${binding.headSha}\nExecution: ${evidence.executionId}\n${ASSURANCE_TEXT}` },
          }));
          validateCheck(check, settings.appId, binding.headSha, name, operationId, true);
        }
        const complete: PublicationRecord = { phase: "complete", operationId, checkIds, reviewId };
        await readBack(complete);
        await deps.journal.write(operationId, complete);
        return complete;
      });
    } catch {
      // API bodies and loader failures may contain confidential input.
      throw new Error("Review publication stopped; inspect the trusted journal and reconcile any pending write");
    }
  };
  return {
    publish: (id: string) => run(id, "publish"),
    inspect: (id: string) => run(id, "inspect"),
    reconcile: async (id: string) => ({ ...await run(id, "reconcile"), auditOnly: true as const }),
  };
}

function reviewBody(operationId: string): string {
  return `Independent review passed: Standards, Spec and Proof.\n\nEvidence: ${operationId}\n${ASSURANCE_TEXT}`;
}

function validateReview(review: Record<string, unknown>, head: string, botId: number, operationId: string): void {
  if (review.commit_id !== head || review.state !== "APPROVED" || review.body !== reviewBody(operationId)
    || object(review.user).id !== botId || object(review.user).type !== "Bot") {
    throw new Error("Review identity mismatch");
  }
}

export function copyPublisherPolicy(policy: PublisherPolicy): PublisherPolicy {
  positiveId(policy.appId);
  positiveId(policy.botUserId);
  for (const value of [policy.model, policy.effort, policy.reviewerHostId]) {
    if (typeof value !== "string" || !/^[A-Za-z0-9_.:-]{1,128}$/.test(value)) throw new Error("Invalid publisher policy");
  }
  if (!Array.isArray(policy.repositories) || !policy.repositories.length
    || new Set(policy.repositories.map(repo => repo.id)).size !== policy.repositories.length) {
    throw new Error("Invalid repository allowlist");
  }
  const repositories = policy.repositories.map(repo => {
    positiveId(repo.id);
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(repo.owner)
      || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(repo.repo)
      || typeof repo.baseBranch !== "string" || !repo.baseBranch || repo.baseBranch.length > 255) {
      throw new Error("Invalid repository policy");
    }
    return { ...repo };
  });
  return { ...policy, repositories };
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid API object");
  return value as Record<string, unknown>;
}

function positiveId(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new Error("Invalid identity");
  return value;
}

function validatePull(pr: Record<string, unknown>, binding: ReviewBinding, branch: string): void {
  const base = object(pr.base);
  const head = object(pr.head);
  if (pr.number !== binding.pullNumber || pr.state !== "open" || pr.draft !== false || pr.merged !== false
    || pr.auto_merge !== null
    || base.ref !== branch || base.sha !== binding.baseSha || head.sha !== binding.headSha
    || object(base.repo).id !== binding.repositoryId || object(head.repo).id !== binding.repositoryId) {
    throw new Error("Pull request changed or is ineligible");
  }
}

function validateCheck(
  check: Record<string, unknown>, appId: number, head: string, name: string, operationId: string, completed: boolean,
): void {
  positiveId(check.id);
  if (object(check.app).id !== appId || check.head_sha !== head || check.name !== name
    || check.external_id !== operationId || check.status !== (completed ? "completed" : "in_progress")
    || (completed && check.conclusion !== "success")) throw new Error("Check identity mismatch");
}

export function validateReviewVetoes(value: unknown): void {
  if (!Array.isArray(value) || value.length >= 100) throw new Error("Incomplete review history");
  const latest = new Map<number, string>();
  for (const item of value) {
    const review = object(item);
    const user = object(review.user);
    if (typeof user.id !== "number" || !Number.isSafeInteger(user.id) || user.id <= 0) throw new Error("Unknown reviewer");
    if (["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(String(review.state))) latest.set(user.id, String(review.state));
    else if (!["COMMENTED", "PENDING"].includes(String(review.state))) throw new Error("Unknown review state");
  }
  if ([...latest.values()].includes("CHANGES_REQUESTED")) throw new Error("Unresolved review veto");
}
