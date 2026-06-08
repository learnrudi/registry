"""Input normalization and validation for video-generator tool calls."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image

from constants import (
    ALLOWED_DURATIONS_SECONDS,
    MAX_PROMPT_CHARS,
    MAX_REFERENCE_BYTES,
    MAX_REFERENCE_COUNT,
    MAX_SOURCE_VIDEO_BYTES,
    REFERENCE_SUFFIXES,
    VIDEO_INPUT_MODES,
    VIDEO_FORMATS,
    VIDEO_SUFFIXES,
)
from errors import ToolError
from outputs import expand_path, image_format_from_file, video_format_from_file
from renderer.providers import PROVIDERS


@dataclass(frozen=True)
class VideoInputs:
    mode: str
    references: list[Path]
    input_image: Path | None = None
    end_image: Path | None = None
    source_video: Path | None = None


def require_string(args: dict[str, Any], name: str) -> str:
    value = args.get(name)
    if not isinstance(value, str) or not value.strip():
        raise ToolError(
            "validation",
            f"`{name}` must be a non-empty string.",
            {"field": name},
        )
    return value.strip()


def optional_string(args: dict[str, Any], name: str) -> str | None:
    value = args.get(name)
    if value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        raise ToolError(
            "validation",
            f"`{name}` must be a non-empty string when provided.",
            {"field": name},
        )
    return value.strip()


def normalize_provider(value: str) -> str:
    provider = value.strip().lower()
    if provider not in PROVIDERS:
        raise ToolError(
            "validation",
            f"Unknown provider `{value}`. Expected one of: {', '.join(PROVIDERS)}.",
            {"field": "provider", "allowed": list(PROVIDERS)},
        )
    return provider


def read_prompt(value: str) -> tuple[str, str]:
    prompt = value.strip()
    if not prompt:
        raise ToolError(
            "validation",
            "`prompt` must be non-empty.",
            {"field": "prompt"},
        )
    if len(prompt) > MAX_PROMPT_CHARS:
        raise ToolError(
            "validation",
            f"`prompt` must be {MAX_PROMPT_CHARS} characters or fewer.",
            {"field": "prompt", "max_chars": MAX_PROMPT_CHARS},
        )
    return prompt, f"literal prompt ({len(prompt)} chars)"


def normalize_video_format(args: dict[str, Any]) -> str:
    value = args.get("format", "story")
    if not isinstance(value, str) or not value.strip():
        raise ToolError(
            "validation",
            "`format` must be a non-empty string when provided.",
            {"field": "format"},
        )
    asset_format = value.strip().lower()
    if asset_format not in VIDEO_FORMATS:
        raise ToolError(
            "validation",
            f"Unknown format `{value}`. Expected one of: {', '.join(VIDEO_FORMATS)}.",
            {"field": "format", "allowed": list(VIDEO_FORMATS)},
        )
    return asset_format


def normalize_duration(args: dict[str, Any]) -> int | None:
    value = args.get("duration_seconds")
    if value is None:
        return None
    if not isinstance(value, int) or isinstance(value, bool):
        raise ToolError(
            "validation",
            "`duration_seconds` must be an integer when provided.",
            {"field": "duration_seconds"},
        )
    if value not in ALLOWED_DURATIONS_SECONDS:
        raise ToolError(
            "validation",
            "`duration_seconds` is outside the normalized duration set.",
            {
                "field": "duration_seconds",
                "allowed": list(ALLOWED_DURATIONS_SECONDS),
            },
        )
    return value


def normalize_mode(args: dict[str, Any]) -> str | None:
    value = args.get("mode")
    if value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        raise ToolError(
            "validation",
            "`mode` must be a non-empty string when provided.",
            {"field": "mode"},
        )
    mode = value.strip().lower()
    if mode not in VIDEO_INPUT_MODES:
        raise ToolError(
            "validation",
            f"Unknown mode `{value}`. Expected one of: {', '.join(VIDEO_INPUT_MODES)}.",
            {"field": "mode", "allowed": list(VIDEO_INPUT_MODES)},
        )
    return mode


def normalize_image_path(value: str, field: str) -> Path:
    if not isinstance(value, str) or not value.strip():
        raise ToolError(
            "validation",
            f"`{field}` must be a non-empty local image file path.",
            {"field": field},
        )
    lowered = value.strip().lower()
    if lowered.startswith(("http://", "https://", "data:")):
        raise ToolError(
            "validation",
            "Image inputs must be local file paths.",
            {"field": field},
        )
    path = expand_path(value.strip())
    if path.suffix.lower() not in REFERENCE_SUFFIXES:
        raise ToolError(
            "validation",
            "Image inputs must be PNG, JPEG, or WebP files.",
            {
                "field": field,
                "allowed_extensions": sorted(REFERENCE_SUFFIXES),
            },
        )
    if not path.exists():
        raise ToolError(
            "validation",
            f"Image input not found: {path}",
            {"field": field, "path": str(path)},
        )
    if not path.is_file():
        raise ToolError(
            "validation",
            f"Image input path is not a file: {path}",
            {"field": field, "path": str(path)},
        )
    try:
        size = path.stat().st_size
    except OSError as exc:
        raise ToolError(
            "validation",
            f"Could not inspect image input: {path}",
            {"field": field, "path": str(path), "detail": str(exc)},
        ) from exc
    if size <= 0 or size > MAX_REFERENCE_BYTES:
        raise ToolError(
            "validation",
            f"Image input must be between 1 byte and {MAX_REFERENCE_BYTES} bytes.",
            {
                "field": field,
                "path": str(path),
                "bytes": size,
                "max_bytes": MAX_REFERENCE_BYTES,
            },
        )
    image_format = image_format_from_file(path)
    if image_format not in {"png", "jpg", "webp"}:
        raise ToolError(
            "validation",
            "Image input content must be PNG, JPEG, or WebP.",
            {
                "field": field,
                "path": str(path),
                "detected_format": image_format,
            },
        )
    return path


def normalize_references(args: dict[str, Any]) -> list[Path]:
    value = args.get("references")
    if value is None:
        return []
    if not isinstance(value, list):
        raise ToolError(
            "validation",
            "`references` must be a list of local image file paths.",
            {"field": "references"},
        )
    if len(value) > MAX_REFERENCE_COUNT:
        raise ToolError(
            "validation",
            f"`references` must contain {MAX_REFERENCE_COUNT} image path(s) or fewer.",
            {"field": "references", "max_items": MAX_REFERENCE_COUNT},
        )

    refs: list[Path] = []
    for index, item in enumerate(value):
        refs.append(normalize_image_path(item, f"references[{index}]"))

    return refs


def normalize_optional_image(args: dict[str, Any], name: str) -> Path | None:
    value = args.get(name)
    if value is None:
        return None
    return normalize_image_path(value, name)


def normalize_source_video(args: dict[str, Any]) -> Path | None:
    value = args.get("source_video")
    if value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        raise ToolError(
            "validation",
            "`source_video` must be a non-empty local video file path.",
            {"field": "source_video"},
        )
    lowered = value.strip().lower()
    if lowered.startswith(("http://", "https://", "data:")):
        raise ToolError(
            "validation",
            "`source_video` must be a local file path.",
            {"field": "source_video"},
        )
    path = expand_path(value.strip())
    if path.suffix.lower() not in VIDEO_SUFFIXES:
        raise ToolError(
            "validation",
            "`source_video` must be an MP4 or WebM file.",
            {
                "field": "source_video",
                "allowed_extensions": sorted(VIDEO_SUFFIXES),
            },
        )
    if not path.exists():
        raise ToolError(
            "validation",
            f"Source video not found: {path}",
            {"field": "source_video", "path": str(path)},
        )
    if not path.is_file():
        raise ToolError(
            "validation",
            f"Source video path is not a file: {path}",
            {"field": "source_video", "path": str(path)},
        )
    try:
        size = path.stat().st_size
    except OSError as exc:
        raise ToolError(
            "validation",
            f"Could not inspect source video: {path}",
            {"field": "source_video", "path": str(path), "detail": str(exc)},
        ) from exc
    if size <= 0 or size > MAX_SOURCE_VIDEO_BYTES:
        raise ToolError(
            "validation",
            f"Source video must be between 1 byte and {MAX_SOURCE_VIDEO_BYTES} bytes.",
            {
                "field": "source_video",
                "path": str(path),
                "bytes": size,
                "max_bytes": MAX_SOURCE_VIDEO_BYTES,
            },
        )
    video_format = video_format_from_file(path)
    if video_format not in {"mp4", "webm"}:
        raise ToolError(
            "validation",
            "Source video content must be MP4 or WebM.",
            {
                "field": "source_video",
                "path": str(path),
                "detected_format": video_format,
            },
        )
    return path


def infer_mode(
    requested_mode: str | None,
    *,
    references: list[Path],
    input_image: Path | None,
    end_image: Path | None,
    source_video: Path | None,
) -> str:
    if requested_mode:
        return requested_mode
    if source_video:
        return "extend"
    if input_image and end_image:
        return "interpolate"
    if input_image:
        return "image"
    if references:
        return "references"
    return "text"


def normalize_video_inputs(args: dict[str, Any]) -> VideoInputs:
    references = normalize_references(args)
    input_image = normalize_optional_image(args, "input_image")
    end_image = normalize_optional_image(args, "end_image")
    source_video = normalize_source_video(args)
    mode = infer_mode(
        normalize_mode(args),
        references=references,
        input_image=input_image,
        end_image=end_image,
        source_video=source_video,
    )

    if mode == "text" and (references or input_image or end_image or source_video):
        raise ToolError(
            "validation",
            "`mode: text` does not accept media input fields.",
            {
                "field": "mode",
                "forbidden_fields": [
                    name
                    for name, present in {
                        "references": bool(references),
                        "input_image": bool(input_image),
                        "end_image": bool(end_image),
                        "source_video": bool(source_video),
                    }.items()
                    if present
                ],
            },
        )
    if mode == "references" and (not references or input_image or end_image or source_video):
        raise ToolError(
            "validation",
            "`mode: references` requires references and no first-frame, last-frame, or source-video input.",
            {"field": "mode"},
        )
    if mode == "image" and (not input_image or references or end_image or source_video):
        raise ToolError(
            "validation",
            "`mode: image` requires input_image only.",
            {"field": "mode"},
        )
    if mode == "interpolate" and (not input_image or not end_image or references or source_video):
        raise ToolError(
            "validation",
            "`mode: interpolate` requires input_image and end_image only.",
            {"field": "mode"},
        )
    if mode == "extend" and (not source_video or references or input_image or end_image):
        raise ToolError(
            "validation",
            "`mode: extend` requires source_video only.",
            {"field": "mode"},
        )

    return VideoInputs(
        mode=mode,
        references=references,
        input_image=input_image,
        end_image=end_image,
        source_video=source_video,
    )


def validate_source_image_format(
    *,
    provider: str,
    model_id: str,
    asset_format: str,
    video_inputs: VideoInputs,
    policy: dict[str, Any],
) -> None:
    if not policy:
        return

    source_images = source_images_for_mode(video_inputs)
    if not source_images:
        return

    expected_ratio = aspect_ratio_for_format(asset_format)
    expected_label = VIDEO_FORMATS[asset_format]["aspect_ratio"]
    tolerance = float(policy.get("tolerance", 0.04))

    for field, path in source_images:
        width, height = image_dimensions(path, field)
        actual_ratio = width / height
        if abs(actual_ratio - expected_ratio) <= tolerance:
            continue
        raise ToolError(
            "unsupported_combo",
            (
                f"{provider}:{model_id} mode `{video_inputs.mode}` follows the "
                f"source image aspect ratio. `{field}` must match format "
                f"`{asset_format}` ({expected_label})."
            ),
            {
                "provider": provider,
                "model": model_id,
                "field": field,
                "mode": video_inputs.mode,
                "format": asset_format,
                "expected_aspect_ratio": expected_label,
                "image_width": width,
                "image_height": height,
                "source_image": str(path),
                "remediation": (
                    "Use an input image with the requested format's aspect ratio "
                    "or choose the matching format."
                ),
            },
        )


def source_images_for_mode(video_inputs: VideoInputs) -> list[tuple[str, Path]]:
    if video_inputs.mode == "image" and video_inputs.input_image:
        return [("input_image", video_inputs.input_image)]
    if video_inputs.mode == "references":
        return [
            (f"references[{index}]", path)
            for index, path in enumerate(video_inputs.references)
        ]
    return []


def aspect_ratio_for_format(asset_format: str) -> float:
    ratio = VIDEO_FORMATS[asset_format]["aspect_ratio"]
    width, height = ratio.split(":", 1)
    return int(width) / int(height)


def image_dimensions(path: Path, field: str) -> tuple[int, int]:
    try:
        with Image.open(path) as image:
            width, height = image.size
    except Exception as exc:
        raise ToolError(
            "validation",
            f"Could not read image dimensions for {path}: {exc}",
            {"field": field, "path": str(path)},
        ) from exc
    if width <= 0 or height <= 0:
        raise ToolError(
            "validation",
            f"Image dimensions must be positive for {path}.",
            {"field": field, "path": str(path), "width": width, "height": height},
        )
    return width, height
