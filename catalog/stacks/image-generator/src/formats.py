"""Content asset format normalization and compatibility rules."""

from __future__ import annotations

from typing import Any

from errors import ToolError


ASSET_FORMATS: dict[str, dict[str, str]] = {
    "square": {
        "aspect_ratio": "1:1",
        "description": "Square feed image.",
    },
    "portrait": {
        "aspect_ratio": "2:3",
        "description": "Vertical feed image.",
    },
    "story": {
        "aspect_ratio": "9:16",
        "description": "Full-height story or short-form vertical image.",
    },
    "landscape": {
        "aspect_ratio": "3:2",
        "description": "Landscape link preview or thumbnail image.",
    },
}


def normalize_asset_format(args: dict[str, Any]) -> str:
    value = args.get("format")
    if value is None:
        return "square"
    if not isinstance(value, str) or not value.strip():
        raise ToolError(
            "validation",
            "`format` must be a non-empty string when provided.",
            {"field": "format"},
        )
    format_id = value.strip().lower()
    if format_id not in ASSET_FORMATS:
        raise ToolError(
            "validation",
            f"Unknown format `{value}`. Expected one of: {', '.join(ASSET_FORMATS)}.",
            {"field": "format", "allowed": list(ASSET_FORMATS)},
        )
    return format_id


def format_metadata(format_id: str) -> dict[str, str]:
    return {
        "asset_format": format_id,
        "aspect_ratio": ASSET_FORMATS[format_id]["aspect_ratio"],
    }


def validate_format_combo(provider: str, model_id: str, format_id: str) -> None:
    aspect_ratio = ASSET_FORMATS[format_id]["aspect_ratio"]
    if (
        provider == "openai"
        and aspect_ratio == "9:16"
        and not model_id.startswith("gpt-image-2")
    ):
        raise ToolError(
            "unsupported_combo",
            "OpenAI image models before gpt-image-2 do not support the `story` format's 9:16 aspect ratio through this stack.",
            {
                "provider": provider,
                "model": model_id,
                "format": format_id,
                "aspect_ratio": aspect_ratio,
                "remediation": "Use OpenAI gpt-image-2, Gemini, or Replicate for 9:16 story images, or use OpenAI `portrait` for a 2:3 vertical image.",
            },
        )
    if provider == "openai" and model_id == "dall-e-2" and aspect_ratio != "1:1":
        raise ToolError(
            "unsupported_combo",
            "dall-e-2 only supports square output in this stack.",
            {
                "provider": provider,
                "model": model_id,
                "format": format_id,
                "aspect_ratio": aspect_ratio,
                "remediation": "Use square output or a GPT Image model.",
            },
        )


def asset_format_matrix() -> dict[str, dict[str, str]]:
    return {
        format_id: {
            "aspect_ratio": data["aspect_ratio"],
            "description": data["description"],
        }
        for format_id, data in ASSET_FORMATS.items()
    }
