"""Replicate beta video provider adapter."""

from __future__ import annotations

import urllib.request
from pathlib import Path
from typing import Any

import replicate

from jobs import VideoJob


class ReplicateVideoClient:
    provider = "replicate"

    def __init__(self, api_token: str) -> None:
        self._client = replicate.Client(api_token=api_token)

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
        media_inputs = [path for path in [input_image, *(references or [])] if path is not None]
        ref_handles = [path.open("rb") for path in media_inputs[:1]]
        try:
            prediction = self._client.predictions.create(
                model=model,
                input=self._input_for_model(
                    model,
                    mode=mode,
                    prompt=prompt,
                    references=ref_handles,
                    aspect_ratio=aspect_ratio,
                    duration_seconds=duration_seconds,
                ),
            )
        finally:
            for handle in ref_handles:
                handle.close()
        return self._prediction_to_job(prediction)

    def get_job(self, job_id: str) -> VideoJob:
        prediction = self._client.predictions.get(job_id)
        return self._prediction_to_job(prediction)

    def download_video(self, job: VideoJob) -> bytes:
        output = getattr(job.raw, "output", None)
        url = self._output_url(output)
        if not url:
            raise RuntimeError("No downloadable Replicate output URL found.")
        with urllib.request.urlopen(url, timeout=60) as response:
            return response.read()

    def video_metadata(self, job: VideoJob) -> dict[str, Any]:
        url = self._output_url(getattr(job.raw, "output", None))
        return {"output_url": url} if url else {}

    def _input_for_model(
        self,
        model: str,
        *,
        mode: str,
        prompt: str,
        references: list[Any],
        aspect_ratio: str,
        duration_seconds: int,
    ) -> dict[str, Any]:
        if mode in {"interpolate", "extend"}:
            raise RuntimeError(f"Replicate adapter does not support mode `{mode}`.")
        payload: dict[str, Any] = {
            "prompt": prompt,
        }
        if "seedance" in model:
            payload["duration"] = duration_seconds
            payload["aspect_ratio"] = aspect_ratio
            payload["resolution"] = "1080p"
            if references:
                payload["image"] = references[0]
            return payload

        if model == "minimax/video-01":
            if references:
                payload["first_frame_image"] = references[0]
            return payload

        if "kling" in model:
            payload["duration"] = duration_seconds
            payload["mode"] = "standard"
            if references:
                payload["start_image"] = references[0]
            return payload

        if references:
            payload["image"] = references[0]
        payload["aspect_ratio"] = aspect_ratio
        return payload

    def _prediction_to_job(self, prediction: Any) -> VideoJob:
        status = str(getattr(prediction, "status", "") or "unknown")
        done = status in {"succeeded", "failed", "canceled"}
        stable_status = "completed" if status == "succeeded" else status
        error = getattr(prediction, "error", None)
        metrics = getattr(prediction, "metrics", None)
        progress = None
        if isinstance(metrics, dict) and status == "succeeded":
            progress = 100
        return VideoJob(
            provider=self.provider,
            job_id=getattr(prediction, "id", "") or "",
            status=stable_status,
            done=done,
            progress=progress,
            error={"message": str(error)} if error else None,
            raw=prediction,
        )

    def _output_url(self, output: Any) -> str | None:
        if isinstance(output, str):
            return output
        if isinstance(output, list):
            for item in output:
                if isinstance(item, str):
                    return item
        url = getattr(output, "url", None)
        if isinstance(url, str):
            return url
        return None
