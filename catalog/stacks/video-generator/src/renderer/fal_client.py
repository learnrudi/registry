"""fal beta hosted video provider adapter."""

from __future__ import annotations

import urllib.request
from pathlib import Path
from typing import Any

from constants import PROVIDER_CALL_TIMEOUT_SECONDS
from errors import ToolError
from jobs import VideoJob


FAL_ENDPOINTS_BY_MODEL_MODE: dict[str, dict[str, str]] = {
    "bytedance/seedance-2.0/fast": {
        "text": "bytedance/seedance-2.0/fast/text-to-video",
        "image": "bytedance/seedance-2.0/fast/image-to-video",
        "interpolate": "bytedance/seedance-2.0/fast/image-to-video",
        "references": "bytedance/seedance-2.0/fast/reference-to-video",
    },
    "bytedance/seedance-2.0": {
        "text": "bytedance/seedance-2.0/text-to-video",
        "image": "bytedance/seedance-2.0/image-to-video",
        "interpolate": "bytedance/seedance-2.0/image-to-video",
        "references": "bytedance/seedance-2.0/reference-to-video",
    },
}


class FalVideoClient:
    provider = "fal"

    def __init__(self, api_key: str) -> None:
        import fal_client as fal_sdk

        self._client = fal_sdk.SyncClient(
            key=api_key,
            default_timeout=PROVIDER_CALL_TIMEOUT_SECONDS,
        )

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
        if source_video is not None:
            raise ToolError(
                "unsupported_combo",
                "fal adapter does not support source-video extension.",
                {"provider": self.provider, "model": model, "field": "source_video"},
            )

        endpoint = self._endpoint_for_model_mode(model, mode)
        image_url = self._upload_path(input_image) if input_image else None
        end_image_url = self._upload_path(end_image) if end_image else None
        image_urls = [self._upload_path(path) for path in references]
        payload = self._input_for_mode(
            mode=mode,
            prompt=prompt,
            image_url=image_url,
            end_image_url=end_image_url,
            image_urls=image_urls,
            aspect_ratio=aspect_ratio,
            duration_seconds=duration_seconds,
        )
        handle = self._client.submit(endpoint, arguments=payload)
        request_id = self._request_id(handle)
        return VideoJob(
            provider=self.provider,
            job_id=self._job_id(endpoint, request_id),
            status="queued",
            done=False,
            raw={
                "endpoint": endpoint,
                "request_id": request_id,
                "status": {"status": "queued"},
            },
        )

    def get_job(self, job_id: str) -> VideoJob:
        endpoint, request_id = self._parse_job_id(job_id)
        handle = self._handle(endpoint, request_id)
        status = handle.status(with_logs=True)
        status_label = self._stable_status(status)
        status_error = self._status_error(status)
        result = None
        if status_label == "completed" and not status_error:
            result = handle.get()
        return self._status_to_job(endpoint, request_id, status, result)

    def download_video(self, job: VideoJob) -> bytes:
        result = self._raw_result(job)
        if result is None and job.succeeded:
            endpoint, request_id = self._parse_job_id(job.job_id)
            result = self._handle(endpoint, request_id).get()
        url = self._video_url(result)
        if not url:
            raise ToolError(
                "provider_error",
                "No downloadable fal output URL found.",
                {"provider": self.provider, "job_id": job.job_id},
            )
        with urllib.request.urlopen(url, timeout=60) as response:
            return response.read()

    def video_metadata(self, job: VideoJob) -> dict[str, Any]:
        result = self._raw_result(job)
        url = self._video_url(result)
        metadata: dict[str, Any] = {"output_url": url} if url else {}
        if isinstance(result, dict) and "seed" in result:
            metadata["seed"] = result["seed"]
        return metadata

    def _endpoint_for_model_mode(self, model: str, mode: str) -> str:
        endpoints = FAL_ENDPOINTS_BY_MODEL_MODE.get(model, {})
        endpoint = endpoints.get(mode)
        if not endpoint:
            raise ToolError(
                "unsupported_combo",
                f"fal:{model} does not support mode `{mode}`.",
                {
                    "provider": self.provider,
                    "model": model,
                    "field": "mode",
                    "mode": mode,
                    "allowed": sorted(endpoints),
                },
            )
        return endpoint

    def _input_for_mode(
        self,
        *,
        mode: str,
        prompt: str,
        image_url: str | None,
        end_image_url: str | None,
        image_urls: list[str],
        aspect_ratio: str,
        duration_seconds: int,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "prompt": prompt,
            "resolution": "720p",
            "duration": str(duration_seconds),
            "aspect_ratio": aspect_ratio,
            "generate_audio": True,
        }
        if mode == "text":
            return payload
        if mode == "image":
            if not image_url:
                raise RuntimeError("fal image mode requires input_image.")
            payload["image_url"] = image_url
            return payload
        if mode == "interpolate":
            if not image_url or not end_image_url:
                raise RuntimeError("fal interpolate mode requires input_image and end_image.")
            payload["image_url"] = image_url
            payload["end_image_url"] = end_image_url
            return payload
        if mode == "references":
            if not image_urls:
                raise RuntimeError("fal references mode requires reference images.")
            payload["image_urls"] = image_urls
            return payload
        raise RuntimeError(f"fal adapter does not support mode `{mode}`.")

    def _upload_path(self, path: Path) -> str:
        return self._client.upload_file(path)

    def _handle(self, endpoint: str, request_id: str) -> Any:
        get_handle = getattr(self._client, "get_handle", None)
        if callable(get_handle):
            return get_handle(endpoint, request_id)
        import fal_client as fal_sdk

        return fal_sdk.SyncRequestHandle.from_request_id(
            self._client.client,
            endpoint,
            request_id,
        )

    def _status_to_job(
        self,
        endpoint: str,
        request_id: str,
        status: Any,
        result: Any | None,
    ) -> VideoJob:
        stable_status = self._stable_status(status)
        error = self._status_error(status)
        if error:
            stable_status = "failed"
        done = stable_status in {"completed", "failed", "canceled"}
        progress = 100 if stable_status == "completed" else None
        return VideoJob(
            provider=self.provider,
            job_id=self._job_id(endpoint, request_id),
            status=stable_status,
            done=done,
            progress=progress,
            error=error,
            raw={
                "endpoint": endpoint,
                "request_id": request_id,
                "status": self._status_data(status),
                "result": result,
            },
        )

    def _stable_status(self, status: Any) -> str:
        status_data = self._status_data(status)
        raw = str(status_data.get("status") or status_data.get("type") or "").lower()
        normalized = raw.replace("-", "_")
        if normalized in {"queued", "in_queue"}:
            return "queued"
        if normalized in {"inprogress", "in_progress"}:
            return "in_progress"
        if normalized in {"completed", "succeeded"}:
            return "completed"
        if normalized in {"failed", "failure"}:
            return "failed"
        if normalized in {"canceled", "cancelled"}:
            return "canceled"
        return normalized or "unknown"

    def _status_error(self, status: Any) -> dict[str, Any] | None:
        status_data = self._status_data(status)
        message = status_data.get("error")
        if not message:
            return None
        error: dict[str, Any] = {"message": str(message)}
        error_type = status_data.get("error_type")
        if error_type:
            error["type"] = str(error_type)
        return error

    def _status_data(self, status: Any) -> dict[str, Any]:
        if isinstance(status, dict):
            return dict(status)
        data: dict[str, Any] = {"type": type(status).__name__}
        for attr in ("status", "position", "logs", "metrics", "error", "error_type"):
            value = getattr(status, attr, None)
            if value is not None:
                data[attr] = value
        return data

    def _video_url(self, result: Any) -> str | None:
        if isinstance(result, dict):
            video = result.get("video")
            if isinstance(video, dict):
                url = video.get("url")
                return url if isinstance(url, str) and url else None
            if isinstance(video, str) and video:
                return video
        video = getattr(result, "video", None)
        url = getattr(video, "url", None)
        if isinstance(url, str) and url:
            return url
        if isinstance(video, str) and video:
            return video
        return None

    def _raw_result(self, job: VideoJob) -> Any:
        if isinstance(job.raw, dict):
            return job.raw.get("result")
        return None

    def _request_id(self, handle: Any) -> str:
        request_id = getattr(handle, "request_id", None)
        if isinstance(request_id, str) and request_id:
            return request_id
        if isinstance(handle, dict):
            request_id = handle.get("request_id")
            if isinstance(request_id, str) and request_id:
                return request_id
        raise RuntimeError("fal submit response did not include request_id.")

    def _job_id(self, endpoint: str, request_id: str) -> str:
        return f"{endpoint}|{request_id}"

    def _parse_job_id(self, job_id: str) -> tuple[str, str]:
        if "|" not in job_id:
            raise ToolError(
                "validation",
                "fal job_id must include endpoint and request id from generate_video.",
                {"provider": self.provider, "job_id": job_id},
            )
        endpoint, request_id = job_id.split("|", 1)
        if not endpoint or not request_id:
            raise ToolError(
                "validation",
                "fal job_id is malformed.",
                {"provider": self.provider, "job_id": job_id},
            )
        return endpoint, request_id
