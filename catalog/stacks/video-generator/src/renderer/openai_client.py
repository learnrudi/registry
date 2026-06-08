"""OpenAI Sora video provider adapter."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from openai import OpenAI

from jobs import VideoJob


SIZE_BY_ASPECT_RATIO = {
    "9:16": "720x1280",
    "16:9": "1280x720",
}


class OpenAIVideoClient:
    provider = "openai"

    def __init__(self, api_key: str) -> None:
        self._client = OpenAI(api_key=api_key)

    def submit_video(
        self,
        *,
        prompt: str,
        mode: str,
        references: list[Path],
        input_image: Path | None,
        end_image: Path | None,
        source_video: Path | None,
        model: str,
        aspect_ratio: str,
        duration_seconds: int,
    ) -> VideoJob:
        kwargs: dict[str, Any] = {
            "model": model,
            "prompt": prompt,
            "seconds": str(duration_seconds),
            "size": SIZE_BY_ASPECT_RATIO[aspect_ratio],
        }
        if mode in {"interpolate", "extend"}:
            raise RuntimeError(f"OpenAI video adapter does not support mode `{mode}`.")

        image_input = input_image or (references[0] if references else None)
        if image_input:
            with image_input.open("rb") as file:
                video = self._client.videos.create(input_reference=file, **kwargs)
        else:
            video = self._client.videos.create(**kwargs)
        return self._video_to_job(video)

    def get_job(self, job_id: str) -> VideoJob:
        return self._video_to_job(self._client.videos.retrieve(job_id))

    def download_video(self, job: VideoJob) -> bytes:
        response = self._client.videos.download_content(job.job_id, variant="video")
        content = getattr(response, "content", None)
        if isinstance(content, bytes):
            return content
        data = response.read()
        if isinstance(data, bytes):
            return data
        raise RuntimeError("OpenAI video content response did not contain bytes.")

    def video_metadata(self, job: VideoJob) -> dict[str, Any]:
        return {"video_id": job.job_id}

    def _video_to_job(self, video: Any) -> VideoJob:
        status = str(getattr(video, "status", "") or "unknown")
        done = status in {"completed", "failed"}
        error = getattr(video, "error", None)
        progress = getattr(video, "progress", None)
        return VideoJob(
            provider=self.provider,
            job_id=getattr(video, "id", "") or "",
            status=status,
            done=done,
            progress=progress if isinstance(progress, int) else None,
            error=error if isinstance(error, dict) else None,
            raw=video,
        )
