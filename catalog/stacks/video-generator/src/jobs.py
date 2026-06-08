"""Provider-neutral video job polling."""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Any

from constants import (
    JOB_TIMEOUT_SECONDS,
    POLL_INTERVAL_SECONDS,
    PROVIDER_CALL_TIMEOUT_SECONDS,
)
from errors import ToolError


@dataclass
class VideoJob:
    provider: str
    job_id: str
    status: str
    done: bool = False
    progress: int | None = None
    error: dict[str, Any] | None = None
    raw: Any | None = None

    @property
    def succeeded(self) -> bool:
        return self.done and self.status in {"completed", "succeeded"}

    @property
    def failed(self) -> bool:
        return self.done and not self.succeeded


def job_payload(job: VideoJob) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "provider": job.provider,
        "job_id": job.job_id,
        "status": job.status,
        "completed": job.succeeded,
    }
    if job.progress is not None:
        payload["progress"] = job.progress
    if job.error:
        payload["provider_error"] = job.error
    return payload


async def _get_job_with_timeout(provider_client: Any, job_id: str) -> VideoJob:
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(provider_client.get_job, job_id),
            timeout=PROVIDER_CALL_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError as exc:
        raise ToolError(
            "timeout",
            f"Provider job status call exceeded {PROVIDER_CALL_TIMEOUT_SECONDS} seconds.",
            {"job_id": job_id, "timeout_seconds": PROVIDER_CALL_TIMEOUT_SECONDS},
        ) from exc


async def poll_video_job(
    provider_client: Any,
    initial_job: VideoJob,
    *,
    timeout_seconds: int = JOB_TIMEOUT_SECONDS,
    poll_interval_seconds: int = POLL_INTERVAL_SECONDS,
) -> VideoJob:
    deadline = time.monotonic() + timeout_seconds
    job = initial_job

    while not job.done:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise ToolError(
                "timeout",
                f"Provider job did not complete within {timeout_seconds} seconds.",
                {
                    "provider": job.provider,
                    "job_id": job.job_id,
                    "status": job.status,
                    "timeout_seconds": timeout_seconds,
                    "remediation": "Call get_video_job with this provider and job_id.",
                },
            )

        await asyncio.sleep(min(poll_interval_seconds, max(0.0, remaining)))
        job = await _get_job_with_timeout(provider_client, job.job_id)

    if job.failed:
        raise ToolError(
            "provider_error",
            f"{job.provider} video job failed.",
            {
                "provider": job.provider,
                "job_id": job.job_id,
                "status": job.status,
                "provider_error": job.error,
            },
        )

    return job
