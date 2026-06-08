"""Static model metadata, defaults, and provider capability rules."""

from __future__ import annotations

import ast
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from constants import MODEL_ENV_BY_PROVIDER, SECRET_BY_PROVIDER
from errors import ToolError
from model_config import (
    DEFAULT_MODELS,
    KNOWN_MODELS,
    REPLICATE_BETA_REASON,
    REPLICATE_PRESET_ALIASES,
    REPLICATE_REFERENCE_CONFIG,
    REPLICATE_RELEASE_STATUS,
    REPLICATE_STABILITY,
)
from renderer.providers import PROVIDERS


@lru_cache(maxsize=1)
def renderer_constants() -> dict[str, dict[str, Any]]:
    return {
        "gemini": {
            "DEFAULT_SKETCH_MODEL": DEFAULT_MODELS["gemini"]["sketch"],
            "DEFAULT_PHOTOREAL_MODEL": DEFAULT_MODELS["gemini"]["photoreal"],
        },
        "openai": {
            "DEFAULT_SKETCH_MODEL": DEFAULT_MODELS["openai"]["sketch"],
            "DEFAULT_PHOTOREAL_MODEL": DEFAULT_MODELS["openai"]["photoreal"],
            "DEFAULT_EDIT_MODEL": DEFAULT_MODELS["openai"]["edit"],
        },
        "replicate": {
            "DEFAULT_SKETCH_MODEL": DEFAULT_MODELS["replicate"]["sketch"],
            "DEFAULT_PHOTOREAL_MODEL": DEFAULT_MODELS["replicate"]["photoreal"],
            "DEFAULT_EDIT_MODEL": DEFAULT_MODELS["replicate"]["edit"],
            "PRESET_ALIASES": REPLICATE_PRESET_ALIASES,
            "REFERENCE_CONFIG": REPLICATE_REFERENCE_CONFIG,
        },
    }


def module_constants(path: Path) -> dict[str, Any]:
    provider_by_file = {
        "gemini_client.py": "gemini",
        "openai_client.py": "openai",
        "replicate_client.py": "replicate",
    }
    provider = provider_by_file.get(path.name)
    if provider:
        return dict(renderer_constants()[provider])

    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    constants: dict[str, Any] = {}
    for node in tree.body:
        target_name: str | None = None
        value_node: ast.AST | None = None
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            target = node.targets[0]
            if isinstance(target, ast.Name):
                target_name = target.id
                value_node = node.value
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            target_name = node.target.id
            value_node = node.value

        if not target_name or value_node is None:
            continue
        if not (
            target_name.startswith("DEFAULT_")
            or target_name in {"PRESET_ALIASES", "REFERENCE_CONFIG"}
        ):
            continue
        try:
            constants[target_name] = ast.literal_eval(value_node)
        except ValueError:
            continue
    return constants


def default_model(provider: str, preset: str) -> str | None:
    value = DEFAULT_MODELS.get(provider, {}).get(preset)
    return value if isinstance(value, str) else None


def active_model(provider: str, preset: str) -> str | None:
    default = default_model(provider, preset)
    env_name = MODEL_ENV_BY_PROVIDER.get(provider, {}).get(preset)
    return os.environ.get(env_name, default) if env_name else default


def resolve_model_static(provider: str, model: str) -> str:
    if provider == "gemini":
        if model in {"sketch", "photoreal"}:
            resolved = active_model(provider, model)
            if resolved:
                return resolved
        if model == "edit":
            raise ToolError(
                "unsupported_combo",
                "Gemini does not define an `edit` preset. Use sketch, photoreal, or an explicit Gemini model id.",
                {"provider": provider, "model": model},
            )
        return model

    if provider == "openai":
        if model in {"sketch", "photoreal", "edit"}:
            resolved = active_model(provider, model)
            if resolved:
                return resolved
        return model

    if provider == "replicate":
        if model in {"sketch", "photoreal", "edit"}:
            resolved = active_model(provider, model)
            if resolved:
                return resolved
        return REPLICATE_PRESET_ALIASES.get(model, model)

    raise ToolError(
        "validation",
        f"Unknown provider `{provider}`.",
        {"field": "provider", "allowed": list(PROVIDERS)},
    )


def openai_supports_reference(model_id: str) -> bool:
    return (
        model_id.startswith("gpt-image")
        or model_id.startswith("chatgpt-image")
        or model_id == "dall-e-2"
    )


def reference_capability(provider: str, model_id: str) -> dict[str, Any]:
    if provider == "gemini":
        supported = not model_id.startswith("imagen-")
        return {
            "supported": supported,
            "max_references": 10 if supported else 0,
            "multi_reference": supported,
            "rule": "Gemini content image models accept references; imagen-* is text-only.",
        }

    if provider == "openai":
        supported = openai_supports_reference(model_id)
        max_references = 0
        multi_reference = False
        if model_id == "dall-e-2":
            max_references = 1
        elif supported:
            max_references = 16
            multi_reference = True
        return {
            "supported": supported,
            "max_references": max_references,
            "multi_reference": multi_reference,
            "rule": "OpenAI references require GPT Image/chatgpt-image models (up to 16 refs) or dall-e-2 (one ref).",
        }

    if provider == "replicate":
        config = REPLICATE_REFERENCE_CONFIG
        if isinstance(config, dict) and model_id in config:
            param_name, allows_list, max_refs = config[model_id]
            return {
                "supported": True,
                "max_references": int(max_refs),
                "multi_reference": bool(allows_list),
                "reference_param": param_name,
                "rule": "Replicate support is model-specific.",
            }
        return {
            "supported": False,
            "max_references": 0,
            "multi_reference": False,
            "rule": "Replicate support is model-specific.",
        }

    raise ToolError(
        "validation",
        f"Unknown provider `{provider}`.",
        {"field": "provider", "allowed": list(PROVIDERS)},
    )


def validate_combo(provider: str, model: str, reference_count: int) -> str:
    model_id = resolve_model_static(provider, model)
    capability = reference_capability(provider, model_id)

    if reference_count and not capability["supported"]:
        raise ToolError(
            "unsupported_combo",
            f"{provider}:{model} resolves to {model_id}, which does not support reference images.",
            {
                "provider": provider,
                "model": model,
                "resolved_model": model_id,
                "references": reference_count,
                "remediation": "Use a reference-capable model from list_models, or remove references.",
            },
        )

    max_refs = int(capability["max_references"])
    if reference_count > max_refs:
        raise ToolError(
            "unsupported_combo",
            f"{provider}:{model} resolves to {model_id}, which accepts up to {max_refs} reference image(s), got {reference_count}.",
            {
                "provider": provider,
                "model": model,
                "resolved_model": model_id,
                "references": reference_count,
                "max_references": max_refs,
                "remediation": "Reduce references or choose a multi-reference model from list_models.",
            },
        )

    return model_id


def preset_entry(provider: str, preset: str) -> dict[str, Any]:
    default = default_model(provider, preset)
    active = active_model(provider, preset)
    capability = reference_capability(provider, active or "")
    return {
        "default_model": default,
        "active_model": active,
        "references": capability,
    }


def secret_status(provider: str) -> dict[str, Any]:
    secret_name = SECRET_BY_PROVIDER[provider]
    return {
        "env": secret_name,
        "configured": bool(os.environ.get(secret_name)),
        "required_for_generation": True,
    }


def known_model_entries(provider: str) -> dict[str, dict[str, Any]]:
    entries: dict[str, dict[str, Any]] = {}
    for model_id, metadata in sorted(KNOWN_MODELS.get(provider, {}).items()):
        entries[model_id] = {
            **metadata,
            "references": reference_capability(provider, model_id),
        }
    return entries


def model_matrix() -> dict[str, Any]:
    replicate_known_models = known_model_entries("replicate")
    aliases = {}
    for alias, model_id in sorted(REPLICATE_PRESET_ALIASES.items()):
        aliases[alias] = {
            "model": model_id,
            "status": replicate_known_models.get(model_id, {}).get(
                "status",
                "unverified",
            ),
            "references": reference_capability("replicate", model_id),
        }

    replicate_reference_models = {}
    for model_id in sorted(REPLICATE_REFERENCE_CONFIG):
        replicate_reference_models[model_id] = reference_capability(
            "replicate",
            model_id,
        )

    return {
        "gemini": {
            "secret": "GEMINI_API_KEY",
            "secret_status": secret_status("gemini"),
            "default_preset": "photoreal",
            "presets": {
                "sketch": preset_entry("gemini", "sketch"),
                "photoreal": preset_entry("gemini", "photoreal"),
            },
            "unsupported_presets": ["edit"],
            "known_models": known_model_entries("gemini"),
            "explicit_models": {
                "reference_rule": "Non-imagen Gemini image model ids accept up to 10 references; imagen-* accepts none.",
            },
        },
        "openai": {
            "secret": "OPENAI_API_KEY",
            "secret_status": secret_status("openai"),
            "default_preset": "photoreal",
            "presets": {
                "sketch": preset_entry("openai", "sketch"),
                "photoreal": preset_entry("openai", "photoreal"),
                "edit": preset_entry("openai", "edit"),
            },
            "known_models": known_model_entries("openai"),
            "explicit_models": {
                "reference_rule": "GPT Image/chatgpt-image models accept up to 16 references; dall-e-2 accepts one; other model ids are text-only.",
            },
        },
        "replicate": {
            "secret": "REPLICATE_API_TOKEN",
            "secret_status": secret_status("replicate"),
            "release_status": REPLICATE_RELEASE_STATUS,
            "stability": REPLICATE_STABILITY,
            "beta_reason": REPLICATE_BETA_REASON,
            "default_preset": "photoreal",
            "presets": {
                "sketch": preset_entry("replicate", "sketch"),
                "photoreal": preset_entry("replicate", "photoreal"),
                "edit": preset_entry("replicate", "edit"),
            },
            "aliases": aliases,
            "reference_models": replicate_reference_models,
            "known_models": replicate_known_models,
            "explicit_models": {
                "reference_rule": "Reference support is available only for model ids listed in reference_models.",
            },
        },
    }
