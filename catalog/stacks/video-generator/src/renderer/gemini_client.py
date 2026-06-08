"""Gemini/Veo video provider adapter."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from google import genai
from google.genai import types

from errors import ToolError
from jobs import VideoJob
from outputs import read_output_metadata


MIME_BY_SUFFIX = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}

class GeminiVideoClient:
    provider = "gemini"

    def __init__(self, api_key: str) -> None:
        self._client = genai.Client(api_key=api_key)

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
        config_kwargs: dict[str, Any] = {
            "number_of_videos": 1,
            "aspect_ratio": aspect_ratio,
            "duration_seconds": duration_seconds,
        }
        request_kwargs: dict[str, Any] = {
            "model": model,
        }

        if mode == "references":
            request_kwargs["prompt"] = prompt
            config_kwargs["reference_images"] = [
                types.VideoGenerationReferenceImage(
                    image=self._image_from_path(path),
                    reference_type=types.VideoGenerationReferenceType.ASSET,
                )
                for path in references
            ]
        elif mode == "image":
            request_kwargs["prompt"] = prompt
            request_kwargs["image"] = self._image_from_path(input_image)
        elif mode == "interpolate":
            request_kwargs["prompt"] = prompt
            request_kwargs["image"] = self._image_from_path(input_image)
            config_kwargs["last_frame"] = self._image_from_path(end_image)
        elif mode == "extend":
            request_kwargs["source"] = types.GenerateVideosSource(
                prompt=prompt,
                video=self._video_from_output(source_video),
            )
        else:
            request_kwargs["prompt"] = prompt

        operation = self._client.models.generate_videos(
            **request_kwargs,
            config=types.GenerateVideosConfig(**config_kwargs),
        )
        return self._operation_to_job(operation)

    def get_job(self, job_id: str) -> VideoJob:
        operation = types.GenerateVideosOperation(name=job_id)
        operation = self._client.operations.get(operation)
        return self._operation_to_job(operation)

    def download_video(self, job: VideoJob) -> bytes:
        video = self._generated_video(job)
        downloaded = self._client.files.download(file=video)
        if isinstance(downloaded, bytes):
            return downloaded
        video_bytes = getattr(video, "video_bytes", None)
        if isinstance(video_bytes, bytes):
            return video_bytes
        raise RuntimeError("Gemini download did not return video bytes.")

    def video_metadata(self, job: VideoJob) -> dict[str, Any]:
        video = self._generated_video(job)
        metadata: dict[str, Any] = {
            "extendable": bool(getattr(video, "uri", None)),
            "retention_days": 2,
        }
        uri = getattr(video, "uri", None)
        if isinstance(uri, str) and uri:
            metadata["gemini_video_uri"] = uri
        mime_type = getattr(video, "mime_type", None)
        if isinstance(mime_type, str) and mime_type:
            metadata["mime_type"] = mime_type
        return metadata

    def _operation_to_job(self, operation: Any) -> VideoJob:
        done = bool(getattr(operation, "done", False))
        error = getattr(operation, "error", None)
        if done and error:
            status = "failed"
        elif done:
            status = "completed"
        else:
            status = "in_progress"

        progress = None
        metadata = getattr(operation, "metadata", None)
        if isinstance(metadata, dict):
            raw_progress = metadata.get("progress") or metadata.get("progressPercent")
            if isinstance(raw_progress, int):
                progress = raw_progress

        return VideoJob(
            provider=self.provider,
            job_id=getattr(operation, "name", "") or "",
            status=status,
            done=done,
            progress=progress,
            error=error if isinstance(error, dict) else None,
            raw=operation,
        )

    def _image_from_path(self, path: Path | None) -> types.Image:
        if path is None:
            raise RuntimeError("Gemini image input path is required for this mode.")
        return types.Image.from_file(
            location=str(path),
            mime_type=MIME_BY_SUFFIX[path.suffix.lower()],
        )

    def _video_from_output(self, path: Path | None) -> types.Video:
        if path is None:
            raise RuntimeError("Gemini source video path is required for extend mode.")
        metadata = read_output_metadata(path)
        if metadata.get("video_path") != str(path):
            raise ToolError(
                "validation",
                "Gemini extend source metadata does not match the source video path.",
                {
                    "field": "source_video",
                    "source_video": str(path),
                    "metadata_video_path": metadata.get("video_path"),
                },
            )
        artifact = metadata.get("provider_artifact")
        if metadata.get("provider") != self.provider or not isinstance(artifact, dict):
            raise ToolError(
                "unsupported_combo",
                "Gemini extend requires a source video generated by this Gemini video stack.",
                {
                    "field": "source_video",
                    "provider": self.provider,
                    "source_video": str(path),
                    "remediation": "Use a recent Veo-generated output that still has its .metadata.json sidecar.",
                },
            )
        uri = artifact.get("gemini_video_uri")
        if not isinstance(uri, str) or not uri:
            raise ToolError(
                "unsupported_combo",
                "Gemini extend requires a provider video URI from a previous Veo generation.",
                {
                    "field": "source_video",
                    "provider": self.provider,
                    "source_video": str(path),
                    "remediation": "Generate the source video with this stack and keep the output metadata sidecar.",
                },
            )
        return types.Video(uri=uri)

    @staticmethod
    def _generated_video(job: VideoJob) -> Any:
        operation = job.raw
        response = getattr(operation, "response", None) or getattr(operation, "result", None)
        generated = getattr(response, "generated_videos", None) or []
        if not generated:
            raise RuntimeError("No generated videos in Gemini operation response.")
        video = getattr(generated[0], "video", None)
        if video is None:
            raise RuntimeError("No video object in Gemini operation response.")
        return video
