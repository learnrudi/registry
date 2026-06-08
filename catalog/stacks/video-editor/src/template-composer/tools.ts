import { readFileSync } from "node:fs";

import { okResult, ToolError, type ToolResult } from "./errors.js";
import { releaseOutputReservation, resolveOutputPaths, stableInputHash, validateRenderedVideo, writeOutputMetadata, type OutputMetadata, type VideoProbe } from "./outputs.js";
import { createRenderJob, enqueueRenderJob, getRenderJob, updateRenderJob, type RenderJob } from "./render_jobs.js";
import { renderTemplateToFile, type RenderTemplateRuntime } from "./remotion_runtime.js";
import { listTemplates, type TemplateStatus } from "./template_registry.js";
import { normalizeJobId, normalizeRenderRequest, normalizeStatus } from "./validation.js";

let renderRuntime: RenderTemplateRuntime = renderTemplateToFile;
let videoValidator: typeof validateRenderedVideo = validateRenderedVideo;

export function setRenderRuntimeForTests(runtime: RenderTemplateRuntime): void {
  renderRuntime = runtime;
}

export function resetRenderRuntimeForTests(): void {
  renderRuntime = renderTemplateToFile;
  videoValidator = validateRenderedVideo;
}

export function setVideoValidatorForTests(validator: typeof validateRenderedVideo): void {
  videoValidator = validator;
}

export function listVideoTemplates(args: Record<string, unknown> = {}): ToolResult {
  const allowed = new Set(["status"]);
  for (const key of Object.keys(args)) {
    if (!allowed.has(key)) {
      throw new ToolError("validation", `Unknown field for video_list_templates: ${key}`, {
        field: key,
      });
    }
  }
  const status = normalizeStatus(args.status) as TemplateStatus | null;
  return okResult({
    templates: listTemplates(status ?? undefined),
  });
}

async function completeRenderJob(job: RenderJob, request: ReturnType<typeof normalizeRenderRequest>, paths: ReturnType<typeof resolveOutputPaths>): Promise<Record<string, unknown>> {
  try {
    const runtimeResult = await renderRuntime({
      request,
      outputPath: paths.video_path,
      onProgress: (progress) => updateRenderJob(job.job_id, { progress }),
    });
    const probe: VideoProbe = await videoValidator(
      paths.video_path,
      request.format,
      request.duration_seconds
    );
    const metadata: OutputMetadata = {
      schema: "rudi.video-editor.template-output.v1",
      video_path: paths.video_path,
      template_id: request.template_id,
      template_version: request.template.version,
      composition_id: request.template.composition_id,
      format: request.format,
      style: request.style,
      fps: request.template.fps,
      duration_seconds: request.duration_seconds,
      input_hash: stableInputHash(request),
      remotion_version: runtimeResult.remotion_version,
      renderer: "remotion",
      created_at: new Date().toISOString(),
      bytes: probe.bytes,
      width: probe.width,
      height: probe.height,
      codec: probe.codec,
    };
    writeOutputMetadata(paths.metadata_path, metadata);

    return {
      out_path: paths.video_path,
      metadata_path: paths.metadata_path,
      metadata,
      video: probe,
    };
  } finally {
    releaseOutputReservation(paths);
  }
}

export async function renderVideoTemplate(args: Record<string, unknown>): Promise<ToolResult> {
  const request = normalizeRenderRequest(args);
  const paths = resolveOutputPaths(request.out_path, request.template_id);
  const job = createRenderJob({
    template_id: request.template_id,
    out_path: paths.video_path,
    metadata_path: paths.metadata_path,
  });

  enqueueRenderJob(job, (renderJob) => completeRenderJob(renderJob, request, paths));

  return okResult({
    job_id: job.job_id,
    status: job.status,
    progress: job.progress,
    template_id: job.template_id,
    out_path: job.out_path,
    metadata_path: job.metadata_path,
    poll_tool: "video_get_render_job",
  });
}

export function getVideoRenderJob(args: Record<string, unknown>): ToolResult {
  const jobId = normalizeJobId(args);
  const job = getRenderJob(jobId);
  return okResult({ job });
}

export function readOutputMetadataForTests(metadataPath: string): unknown {
  return JSON.parse(readFileSync(metadataPath, "utf8"));
}
