import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { JOBS_DIR, MAX_CONCURRENT_RENDERS } from "./constants.js";
import { ToolError, type ErrorKind } from "./errors.js";

export type RenderJobStatus = "queued" | "rendering" | "completed" | "failed" | "canceled";

export interface RenderJob {
  job_id: string;
  template_id: string;
  status: RenderJobStatus;
  progress: number;
  out_path: string;
  metadata_path: string;
  created_at: string;
  completed_at: string | null;
  error: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
}

type Runner = (job: RenderJob) => Promise<Record<string, unknown>>;

interface QueuedRunner {
  jobId: string;
  runner: Runner;
}

const jobs = new Map<string, RenderJob>();
const queue: QueuedRunner[] = [];
let activeRenders = 0;

function now(): string {
  return new Date().toISOString();
}

function jobPath(jobId: string): string {
  return join(JOBS_DIR, `${jobId}.json`);
}

function persistJob(job: RenderJob): void {
  mkdirSync(JOBS_DIR, { recursive: true });
  writeFileSync(jobPath(job.job_id), `${JSON.stringify(job, null, 2)}\n`, "utf8");
}

function randomJobId(): string {
  return randomBytes(16).toString("hex");
}

export function createRenderJob(input: {
  template_id: string;
  out_path: string;
  metadata_path: string;
}): RenderJob {
  const job: RenderJob = {
    job_id: `render_${randomJobId()}`,
    template_id: input.template_id,
    status: "queued",
    progress: 0,
    out_path: input.out_path,
    metadata_path: input.metadata_path,
    created_at: now(),
    completed_at: null,
    error: null,
    output: null,
  };
  jobs.set(job.job_id, job);
  persistJob(job);
  return job;
}

export function updateRenderJob(jobId: string, patch: Partial<RenderJob>): RenderJob {
  const current = getRenderJob(jobId);
  const next = {
    ...current,
    ...patch,
    progress: patch.progress === undefined ? current.progress : Math.max(0, Math.min(100, patch.progress)),
  };
  jobs.set(jobId, next);
  persistJob(next);
  return next;
}

export function getRenderJob(jobId: string): RenderJob {
  const cached = jobs.get(jobId);
  if (cached) {
    return cached;
  }
  try {
    const parsed = JSON.parse(readFileSync(jobPath(jobId), "utf8")) as RenderJob;
    jobs.set(jobId, parsed);
    return parsed;
  } catch {
    throw new ToolError("validation", `Unknown render job: ${jobId}`, {
      field: "job_id",
      job_id: jobId,
    });
  }
}

function failurePayload(error: unknown): { error_kind: ErrorKind; message: string; [key: string]: unknown } {
  if (error instanceof ToolError) {
    return {
      error_kind: error.error_kind,
      message: error.message,
      ...(error.details ?? {}),
    };
  }
  return {
    error_kind: "internal_error",
    message: "Render job failed unexpectedly.",
    detail: error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000),
  };
}

function drainQueue(): void {
  while (activeRenders < MAX_CONCURRENT_RENDERS && queue.length > 0) {
    const item = queue.shift();
    if (!item) {
      return;
    }
    activeRenders += 1;
    updateRenderJob(item.jobId, { status: "rendering", progress: 1 });
    void item
      .runner(getRenderJob(item.jobId))
      .then((output) => {
        updateRenderJob(item.jobId, {
          status: "completed",
          progress: 100,
          completed_at: now(),
          output,
          error: null,
        });
      })
      .catch((error: unknown) => {
        updateRenderJob(item.jobId, {
          status: "failed",
          completed_at: now(),
          error: failurePayload(error),
        });
      })
      .finally(() => {
        activeRenders -= 1;
        drainQueue();
      });
  }
}

export function enqueueRenderJob(job: RenderJob, runner: Runner): void {
  queue.push({ jobId: job.job_id, runner });
  drainQueue();
}

export async function waitForRenderJobForTests(jobId: string, timeoutMs = 15_000): Promise<RenderJob> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const job = getRenderJob(jobId);
    if (job.status === "completed" || job.status === "failed" || job.status === "canceled") {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return getRenderJob(jobId);
}

export function resetRenderJobsForTests(): void {
  jobs.clear();
  queue.length = 0;
  activeRenders = 0;
}
