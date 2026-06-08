"""Provider registry and provider:model parsing."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Protocol

from jobs import VideoJob
from model_config import KNOWN_MODELS


PROVIDERS = tuple(KNOWN_MODELS)


class VideoProvider(Protocol):
    provider: str

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
    ) -> VideoJob: ...

    def get_job(self, job_id: str) -> VideoJob: ...

    def download_video(self, job: VideoJob) -> bytes: ...

    def video_metadata(self, job: VideoJob) -> dict[str, Any]: ...


def get_provider(name: str, **kwargs) -> VideoProvider:
    key = name.strip().lower()
    if key == "gemini":
        try:
            from .gemini_client import GeminiVideoClient
        except ImportError:
            from gemini_client import GeminiVideoClient  # type: ignore[no-redef]

        return GeminiVideoClient(**kwargs)
    if key == "replicate":
        try:
            from .replicate_client import ReplicateVideoClient
        except ImportError:
            from replicate_client import ReplicateVideoClient  # type: ignore[no-redef]

        return ReplicateVideoClient(**kwargs)
    if key == "fal":
        try:
            from .fal_client import FalVideoClient
        except ImportError:
            from fal_client import FalVideoClient  # type: ignore[no-redef]

        return FalVideoClient(**kwargs)
    if key == "openai":
        try:
            from .openai_client import OpenAIVideoClient
        except ImportError:
            from openai_client import OpenAIVideoClient  # type: ignore[no-redef]

        return OpenAIVideoClient(**kwargs)
    raise ValueError(
        f"Unknown provider: {name!r}. Expected one of: {', '.join(PROVIDERS)}."
    )


def parse_spec(spec: str) -> tuple[str, str]:
    if ":" not in spec:
        raise ValueError(f"Spec must be 'provider:model', got: {spec!r}")
    provider, model = spec.split(":", 1)
    provider = provider.strip().lower()
    model = model.strip()
    if provider not in PROVIDERS:
        raise ValueError(
            f"Unknown provider in spec {spec!r}. Expected one of: {', '.join(PROVIDERS)}."
        )
    if not model:
        raise ValueError(f"Empty model in spec: {spec!r}")
    return provider, model
