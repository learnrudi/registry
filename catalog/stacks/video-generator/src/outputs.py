"""Output path policy and generated video byte validation."""

from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Any

from constants import (
    DEFAULT_OUTPUT_DIR,
    DEFAULT_OUTPUT_EXTENSION,
    IMAGE_SIGNATURES,
    VIDEO_SIGNATURES,
    VIDEO_SUFFIXES,
)
from errors import ToolError


def timestamp() -> str:
    return time.strftime("%Y%m%d-%H%M%S")


def nonce() -> str:
    return uuid.uuid4().hex[:8]


def expand_path(value: str) -> Path:
    return Path(value).expanduser().resolve()


def is_relative_to(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def ensure_output_path(path: Path, field: str) -> None:
    output_root = DEFAULT_OUTPUT_DIR.resolve()
    if not is_relative_to(path, output_root):
        raise ToolError(
            "validation",
            f"`{field}` must be inside {output_root}.",
            {"field": field, "path": str(path), "allowed_root": str(output_root)},
        )


def output_path(value: str | None) -> tuple[Path, bool]:
    if value:
        out_path = expand_path(value)
        is_auto = False
        if out_path.suffix.lower() not in VIDEO_SUFFIXES:
            raise ToolError(
                "validation",
                "`out_path` must end in .mp4 or .webm.",
                {
                    "field": "out_path",
                    "path": str(out_path),
                    "allowed_extensions": sorted(VIDEO_SUFFIXES),
                },
            )
    else:
        out_path = DEFAULT_OUTPUT_DIR / f"video-{timestamp()}-{nonce()}.{DEFAULT_OUTPUT_EXTENSION}"
        is_auto = True

    ensure_output_path(out_path, "out_path")
    if out_path.exists():
        raise ToolError(
            "validation",
            f"Output path already exists: {out_path}",
            {"field": "out_path", "path": str(out_path)},
        )
    metadata_path = output_metadata_path(out_path)
    if metadata_path.exists():
        raise ToolError(
            "validation",
            f"Output metadata path already exists: {metadata_path}",
            {"field": "out_path", "path": str(metadata_path)},
        )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    return out_path, is_auto


def detect_video_format(video_bytes: bytes) -> str:
    if len(video_bytes) >= 12 and video_bytes[4:8] == b"ftyp":
        return "mp4"
    for signature, video_format in VIDEO_SIGNATURES:
        if video_bytes.startswith(signature):
            return video_format
    return "bin"


def detect_image_format(image_bytes: bytes) -> str:
    for signature, image_format in IMAGE_SIGNATURES:
        if image_bytes.startswith(signature):
            if image_format == "webp":
                if len(image_bytes) >= 12 and image_bytes[8:12] == b"WEBP":
                    return image_format
                continue
            return image_format
    return "bin"


def image_format_from_file(path: Path) -> str:
    with path.open("rb") as file:
        return detect_image_format(file.read(16))


def video_format_from_file(path: Path) -> str:
    with path.open("rb") as file:
        return detect_video_format(file.read(16))


def validate_video_bytes(video_bytes: bytes, provider: str, model_id: str) -> str:
    video_format = detect_video_format(video_bytes)
    if video_format == "bin":
        raise ToolError(
            "provider_error",
            f"{provider} returned bytes that do not look like MP4 or WebM video.",
            {"provider": provider, "model": model_id},
        )
    return video_format


def path_for_detected_format(out_path: Path, video_format: str, is_auto_path: bool) -> Path:
    if is_auto_path:
        return out_path.with_suffix(f".{video_format}")

    suffix_format = out_path.suffix.lower().lstrip(".")
    if suffix_format != video_format:
        raise ToolError(
            "write_failed",
            f"Output extension .{suffix_format} does not match detected {video_format} bytes.",
            {"out_path": str(out_path), "detected_format": video_format},
        )
    return out_path


def safe_write_video(
    out_path: Path,
    video_bytes: bytes,
    *,
    is_auto_path: bool,
    provider: str,
    model_id: str,
) -> tuple[Path, str]:
    video_format = validate_video_bytes(video_bytes, provider, model_id)
    final_out_path = path_for_detected_format(out_path, video_format, is_auto_path)
    if final_out_path.exists():
        raise ToolError(
            "write_failed",
            f"Output path already exists: {final_out_path}",
            {"out_path": str(final_out_path)},
        )

    try:
        final_out_path.write_bytes(video_bytes)
    except OSError as exc:
        raise ToolError(
            "write_failed",
            f"Could not write generated video to {final_out_path}: {exc}",
            {"out_path": str(final_out_path)},
        ) from exc

    return final_out_path, video_format


def output_metadata_path(video_path: Path) -> Path:
    return video_path.with_suffix(f"{video_path.suffix}.metadata.json")


def write_output_metadata(
    video_path: Path,
    *,
    provider: str,
    model_id: str,
    job_id: str,
    mode: str,
    asset_format: str,
    video_format: str,
    byte_count: int,
    provider_metadata: dict[str, Any] | None = None,
) -> Path:
    metadata_path = output_metadata_path(video_path)
    ensure_output_path(metadata_path, "metadata_path")
    if metadata_path.exists():
        raise ToolError(
            "write_failed",
            f"Output metadata path already exists: {metadata_path}",
            {"path": str(metadata_path)},
        )

    payload = {
        "schema": "rudi.video-generator.output.v1",
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "video_path": str(video_path),
        "provider": provider,
        "model": model_id,
        "job_id": job_id,
        "mode": mode,
        "asset_format": asset_format,
        "video_format": video_format,
        "bytes": byte_count,
        "provider_artifact": provider_metadata or {},
    }
    try:
        metadata_path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    except OSError as exc:
        raise ToolError(
            "write_failed",
            f"Could not write video metadata to {metadata_path}: {exc}",
            {"path": str(metadata_path)},
        ) from exc
    return metadata_path


def read_output_metadata(video_path: Path) -> dict[str, Any]:
    metadata_path = output_metadata_path(video_path)
    if not metadata_path.exists():
        raise ToolError(
            "validation",
            f"Video metadata sidecar is required for this source video: {metadata_path}",
            {"field": "source_video", "metadata_path": str(metadata_path)},
        )
    try:
        payload = json.loads(metadata_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ToolError(
            "validation",
            f"Could not read video metadata sidecar {metadata_path}: {exc}",
            {"field": "source_video", "metadata_path": str(metadata_path)},
        ) from exc
    if not isinstance(payload, dict):
        raise ToolError(
            "validation",
            f"Video metadata sidecar must contain a JSON object: {metadata_path}",
            {"field": "source_video", "metadata_path": str(metadata_path)},
        )
    if payload.get("schema") != "rudi.video-generator.output.v1":
        raise ToolError(
            "validation",
            f"Video metadata sidecar has an unsupported schema: {metadata_path}",
            {"field": "source_video", "metadata_path": str(metadata_path)},
        )
    return payload
