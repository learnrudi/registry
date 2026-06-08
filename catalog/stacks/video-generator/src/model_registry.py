"""Static model metadata and list_video_models response builder."""

from __future__ import annotations

import copy
import os
from typing import Any

from constants import JOB_TIMEOUT_SECONDS, MODEL_ENV_BY_PROVIDER, VIDEO_FORMATS
from errors import ToolError
from model_config import (
    DEFAULT_MODEL_BY_PROVIDER,
    KNOWN_MODELS,
    MODEL_ALIASES,
    PROVIDER_CONFIGS,
)
from provider_runtime import secret_status
from renderer.providers import PROVIDERS


def default_model(provider: str) -> str:
    return DEFAULT_MODEL_BY_PROVIDER[provider]


def active_default_model(provider: str) -> str:
    env_name = MODEL_ENV_BY_PROVIDER.get(provider)
    return os.environ.get(env_name, default_model(provider)) if env_name else default_model(provider)


def resolve_model_static(provider: str, model: str | None) -> str:
    requested = (model or "default").strip()
    if not requested:
        requested = "default"

    if provider not in PROVIDERS:
        raise ToolError(
            "validation",
            f"Unknown provider `{provider}`.",
            {"field": "provider", "allowed": list(PROVIDERS)},
        )

    if requested == "default":
        return active_default_model(provider)
    return MODEL_ALIASES.get(provider, {}).get(requested, requested)


def model_metadata(provider: str, model_id: str) -> dict[str, Any]:
    metadata = KNOWN_MODELS.get(provider, {}).get(model_id)
    if metadata is None:
        raise ToolError(
            "unsupported_combo",
            f"{provider}:{model_id} is not in the video model catalog.",
            {
                "provider": provider,
                "model": model_id,
                "remediation": "Call list_video_models and choose a listed model or alias.",
            },
        )
    return copy.deepcopy(metadata)


def validate_model_combo(
    provider: str,
    model: str | None,
    asset_format: str,
    duration_seconds: int | None,
    mode: str,
    reference_count: int,
) -> tuple[str, int]:
    model_id = resolve_model_static(provider, model)
    metadata = model_metadata(provider, model_id)

    formats = list(metadata.get("formats", []))
    if asset_format not in formats:
        raise ToolError(
            "unsupported_combo",
            f"{provider}:{model_id} does not support format `{asset_format}`.",
            {
                "provider": provider,
                "model": model_id,
                "field": "format",
                "allowed": formats,
            },
        )

    duration = int(duration_seconds or metadata["default_duration_seconds"])
    durations = [int(value) for value in metadata.get("durations", [])]
    if duration not in durations:
        raise ToolError(
            "unsupported_combo",
            f"{provider}:{model_id} does not support {duration} second videos.",
            {
                "provider": provider,
                "model": model_id,
                "field": "duration_seconds",
                "allowed": durations,
            },
        )

    modes = metadata.get("modes", {})
    mode_data = modes.get(mode) if isinstance(modes, dict) else None
    if not isinstance(mode_data, dict) or not mode_data.get("supported"):
        raise ToolError(
            "unsupported_combo",
            f"{provider}:{model_id} does not support mode `{mode}`.",
            {
                "provider": provider,
                "model": model_id,
                "field": "mode",
                "mode": mode,
                "allowed": [key for key, value in modes.items() if value.get("supported")]
                if isinstance(modes, dict)
                else [],
            },
        )

    references = metadata.get("references", {})
    max_refs = int(mode_data.get("max_references", references.get("max_references", 0)))
    if mode == "references" and reference_count == 0:
        raise ToolError(
            "unsupported_combo",
            f"{provider}:{model_id} requires at least one reference image for mode `references`.",
            {
                "provider": provider,
                "model": model_id,
                "field": "references",
                "min_items": 1,
            },
        )
    if reference_count and mode != "references":
        raise ToolError(
            "unsupported_combo",
            f"{provider}:{model_id} only accepts `references` in mode `references`.",
            {
                "provider": provider,
                "model": model_id,
                "references": reference_count,
                "mode": mode,
                "remediation": "Remove references or set mode to `references`.",
            },
        )
    if reference_count > max_refs:
        raise ToolError(
            "unsupported_combo",
            f"{provider}:{model_id} accepts up to {max_refs} reference image(s), got {reference_count}.",
            {
                "provider": provider,
                "model": model_id,
                "references": reference_count,
                "max_references": max_refs,
            },
        )
    if provider == "gemini" and mode in {"image", "interpolate", "references", "extend"} and duration != 8:
        raise ToolError(
            "unsupported_combo",
            "Gemini/Veo media-conditioned generations must use duration_seconds: 8.",
            {
                "provider": provider,
                "model": model_id,
                "field": "duration_seconds",
                "mode": mode,
                "required_value": 8,
            },
        )

    return model_id, duration


def source_image_format_policy(provider: str, model_id: str, mode: str) -> dict[str, Any]:
    metadata = model_metadata(provider, model_id)
    policy = metadata.get("source_image_format_policy", {})
    if not isinstance(policy, dict):
        return {}
    modes = policy.get("modes", [])
    if not isinstance(modes, list) or mode not in modes:
        return {}
    return copy.deepcopy(policy)


def model_matrix() -> dict[str, Any]:
    matrix: dict[str, Any] = {}
    for provider in PROVIDERS:
        aliases = {
            alias: model_id
            for alias, model_id in sorted(MODEL_ALIASES.get(provider, {}).items())
        }
        models: dict[str, Any] = {}
        for model_id, metadata in sorted(KNOWN_MODELS.get(provider, {}).items()):
            models[model_id] = copy.deepcopy(metadata)
        matrix[provider] = {
            **copy.deepcopy(PROVIDER_CONFIGS.get(provider, {})),
            "secret": secret_status(provider)["env"],
            "secret_status": secret_status(provider),
            "default_model": default_model(provider),
            "active_default_model": active_default_model(provider),
            "aliases": aliases,
            "models": models,
        }
    return matrix


def format_matrix() -> dict[str, dict[str, str]]:
    return copy.deepcopy(VIDEO_FORMATS)


def list_video_models(args: dict[str, Any]) -> dict[str, Any]:
    provider_value = args.get("provider")
    provider: str | None = None
    if provider_value is not None:
        if not isinstance(provider_value, str) or not provider_value.strip():
            raise ToolError(
                "validation",
                "`provider` must be a non-empty string when provided.",
                {"field": "provider"},
            )
        provider = provider_value.strip().lower()
        if provider not in PROVIDERS:
            raise ToolError(
                "validation",
                f"Unknown provider `{provider_value}`.",
                {"field": "provider", "allowed": list(PROVIDERS)},
            )

    matrix = model_matrix()
    providers = {provider: matrix[provider]} if provider else matrix
    return {
        "ok": True,
        "timeout_seconds": JOB_TIMEOUT_SECONDS,
        "formats": format_matrix(),
        "providers": providers,
    }
