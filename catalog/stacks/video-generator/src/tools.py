"""Public tool orchestration for the video-generator MCP stack."""

from __future__ import annotations

import time
from typing import Any

from constants import VIDEO_FORMATS
from errors import ToolError, ok_result
from jobs import job_payload, poll_video_job
from model_registry import list_video_models as _list_video_models
from model_registry import source_image_format_policy, validate_model_combo
from outputs import output_path, safe_write_video, write_output_metadata
from provider_runtime import build_provider, call_provider_method
from validation import (
    normalize_duration,
    normalize_provider,
    normalize_video_format,
    normalize_video_inputs,
    optional_string,
    read_prompt,
    require_string,
    validate_source_image_format,
)


async def generate_video(args: dict[str, Any]) -> dict[str, Any]:
    provider = normalize_provider(require_string(args, "provider"))
    prompt_text, _prompt_label = read_prompt(require_string(args, "prompt"))
    model = optional_string(args, "model") or "default"
    asset_format = normalize_video_format(args)
    duration_value = normalize_duration(args)
    video_inputs = normalize_video_inputs(args)
    model_id, duration_seconds = validate_model_combo(
        provider,
        model,
        asset_format,
        duration_value,
        video_inputs.mode,
        len(video_inputs.references),
    )
    validate_source_image_format(
        provider=provider,
        model_id=model_id,
        asset_format=asset_format,
        video_inputs=video_inputs,
        policy=source_image_format_policy(provider, model_id, video_inputs.mode),
    )
    out_path, is_auto_path = output_path(optional_string(args, "out_path"))
    provider_client = build_provider(provider)

    started = time.monotonic()
    initial_job = await call_provider_method(
        provider_client,
        "submit_video",
        prompt=prompt_text,
        mode=video_inputs.mode,
        references=video_inputs.references,
        input_image=video_inputs.input_image,
        end_image=video_inputs.end_image,
        source_video=video_inputs.source_video,
        model=model_id,
        aspect_ratio=VIDEO_FORMATS[asset_format]["aspect_ratio"],
        duration_seconds=duration_seconds,
    )
    job = await poll_video_job(provider_client, initial_job)
    video_bytes = await call_provider_method(provider_client, "download_video", job)
    provider_metadata = await _provider_video_metadata(provider_client, job)
    final_out_path, video_format = safe_write_video(
        out_path,
        video_bytes,
        is_auto_path=is_auto_path,
        provider=provider,
        model_id=model_id,
    )
    metadata_path = write_output_metadata(
        final_out_path,
        provider=provider,
        model_id=model_id,
        job_id=job.job_id,
        mode=video_inputs.mode,
        asset_format=asset_format,
        video_format=video_format,
        byte_count=len(video_bytes),
        provider_metadata=provider_metadata,
    )

    return ok_result(
        out_path=str(final_out_path),
        metadata_path=str(metadata_path),
        provider=provider,
        model=model_id,
        job_id=job.job_id,
        status=job.status,
        asset_format=asset_format,
        mode=video_inputs.mode,
        aspect_ratio=VIDEO_FORMATS[asset_format]["aspect_ratio"],
        duration_seconds=duration_seconds,
        bytes=len(video_bytes),
        format=video_format,
        video_format=video_format,
        ms=int((time.monotonic() - started) * 1000),
    )


async def get_video_job(args: dict[str, Any]) -> dict[str, Any]:
    provider = normalize_provider(require_string(args, "provider"))
    job_id = require_string(args, "job_id")
    provider_client = build_provider(provider)

    job = await call_provider_method(provider_client, "get_job", job_id)
    if job.failed:
        raise ToolError(
            "provider_error",
            f"{provider} video job failed.",
            {
                "provider": provider,
                "job_id": job.job_id,
                "status": job.status,
                "provider_error": job.error,
            },
        )

    if not job.succeeded:
        return ok_result(**job_payload(job))

    out_path, is_auto_path = output_path(optional_string(args, "out_path"))
    video_bytes = await call_provider_method(provider_client, "download_video", job)
    provider_metadata = await _provider_video_metadata(provider_client, job)
    final_out_path, video_format = safe_write_video(
        out_path,
        video_bytes,
        is_auto_path=is_auto_path,
        provider=provider,
        model_id="job-result",
    )
    metadata_path = write_output_metadata(
        final_out_path,
        provider=provider,
        model_id="job-result",
        job_id=job.job_id,
        mode="job-result",
        asset_format="job-result",
        video_format=video_format,
        byte_count=len(video_bytes),
        provider_metadata=provider_metadata,
    )
    return ok_result(
        **job_payload(job),
        out_path=str(final_out_path),
        metadata_path=str(metadata_path),
        bytes=len(video_bytes),
        format=video_format,
        video_format=video_format,
    )


def list_video_models(args: dict[str, Any]) -> dict[str, Any]:
    return _list_video_models(args)


async def _provider_video_metadata(provider_client: Any, job: Any) -> dict[str, Any]:
    if not callable(getattr(provider_client, "video_metadata", None)):
        return {}
    metadata = await call_provider_method(provider_client, "video_metadata", job)
    return metadata if isinstance(metadata, dict) else {}
