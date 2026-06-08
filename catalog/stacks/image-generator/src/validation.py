"""Input validation for image-generator tool calls."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from constants import MAX_PROMPT_CHARS, MAX_REFERENCE_BYTES, MAX_REFERENCE_COUNT, REFERENCE_SUFFIXES
from errors import ToolError
from outputs import expand_path, image_format_from_file
from renderer.providers import PROVIDERS


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
        if not isinstance(item, str) or not item.strip():
            raise ToolError(
                "validation",
                "`references` entries must be non-empty strings.",
                {"field": f"references[{index}]"},
            )
        lowered = item.strip().lower()
        if lowered.startswith(("http://", "https://", "data:")):
            raise ToolError(
                "validation",
                "Reference images must be local file paths.",
                {"field": f"references[{index}]"},
            )
        path = expand_path(item.strip())
        suffix = path.suffix.lower()
        if suffix not in REFERENCE_SUFFIXES:
            raise ToolError(
                "validation",
                "Reference images must be PNG, JPEG, or WebP files.",
                {
                    "field": f"references[{index}]",
                    "allowed_extensions": sorted(REFERENCE_SUFFIXES),
                },
            )
        if not path.exists():
            raise ToolError(
                "validation",
                f"Reference image not found: {path}",
                {"field": f"references[{index}]", "path": str(path)},
            )
        if not path.is_file():
            raise ToolError(
                "validation",
                f"Reference path is not a file: {path}",
                {"field": f"references[{index}]", "path": str(path)},
            )
        try:
            size = path.stat().st_size
        except OSError as exc:
            raise ToolError(
                "validation",
                f"Could not inspect reference image: {path}",
                {"field": f"references[{index}]", "path": str(path), "detail": str(exc)},
            ) from exc
        if size <= 0 or size > MAX_REFERENCE_BYTES:
            raise ToolError(
                "validation",
                f"Reference image must be between 1 byte and {MAX_REFERENCE_BYTES} bytes.",
                {
                    "field": f"references[{index}]",
                    "path": str(path),
                    "bytes": size,
                    "max_bytes": MAX_REFERENCE_BYTES,
                },
            )
        image_format = image_format_from_file(path)
        if image_format not in {"png", "jpg", "webp"}:
            raise ToolError(
                "validation",
                "Reference image content must be PNG, JPEG, or WebP.",
                {
                    "field": f"references[{index}]",
                    "path": str(path),
                    "detected_format": image_format,
                },
            )
        refs.append(path)
    return refs
