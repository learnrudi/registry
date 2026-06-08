"""Public tool handlers for the image-generator MCP stack."""

from __future__ import annotations

import time
from typing import Any

from constants import (
    DEFAULT_OUTPUT_DIR,
    MAX_COMPARE_SPECS,
    MAX_PROMPT_CHARS,
    MAX_REFERENCE_COUNT,
    TIMEOUT_SECONDS,
)
from errors import ToolError, ok_result
from formats import (
    ASSET_FORMATS,
    asset_format_matrix as _asset_format_matrix,
    format_metadata as _format_metadata,
    normalize_asset_format as _normalize_asset_format,
    validate_format_combo as _validate_format_combo,
)
from gallery import slugify as _slugify, write_gallery as _write_gallery
from model_registry import (
    active_model as _active_model,
    default_model as _default_model,
    model_matrix as _model_matrix,
    module_constants as _module_constants,
    openai_supports_reference as _openai_supports_reference,
    preset_entry as _preset_entry,
    reference_capability as _reference_capability,
    renderer_constants as _renderer_constants,
    resolve_model_static as _resolve_model_static,
    secret_status as _secret_status,
    validate_combo as _validate_combo,
)
from outputs import (
    detect_image_format as _detect_image_format,
    ensure_output_path as _ensure_output_path,
    expand_path as _expand_path,
    image_format_from_file as _image_format_from_file,
    is_relative_to as _is_relative_to,
    nonce as _nonce,
    output_dir as _output_dir,
    output_path as _output_path,
    path_for_detected_format as _path_for_detected_format,
    safe_write_image as _safe_write_image,
    timestamp as _timestamp,
    validate_image_bytes as _validate_image_bytes,
)
from provider_runtime import (
    build_provider as _build_provider,
    call_provider as _call_provider,
    require_secret as _require_secret,
)
from renderer.providers import parse_spec
from validation import (
    normalize_provider as _normalize_provider,
    normalize_references as _normalize_references,
    optional_string as _optional_string,
    read_prompt as _read_prompt,
    require_string as _require_string,
)


def _compact_error(exc: ToolError) -> dict[str, Any]:
    payload = exc.to_result()
    payload.pop("ok", None)
    return payload


async def generate_image(args: dict[str, Any]) -> dict[str, Any]:
    provider = _normalize_provider(_require_string(args, "provider"))
    prompt_text, _prompt_label = _read_prompt(_require_string(args, "prompt"))
    model = _optional_string(args, "model") or "photoreal"
    asset_format = _normalize_asset_format(args)
    references = _normalize_references(args)
    model_id = _validate_combo(provider, model, len(references))
    _validate_format_combo(provider, model_id, asset_format)
    out_path, is_auto_path = _output_path(_optional_string(args, "out_path"))
    provider_client = _build_provider(provider)

    started = time.monotonic()
    try:
        image_bytes = await _call_provider(
            provider_client,
            prompt_text,
            references,
            model,
            aspect_ratio=ASSET_FORMATS[asset_format]["aspect_ratio"],
        )
    except ToolError:
        raise
    except Exception as exc:
        raise ToolError(
            "provider_error",
            f"{provider} image generation failed: {exc}",
            {"provider": provider, "model": model_id},
        ) from exc

    final_out_path, image_format = _safe_write_image(
        out_path,
        image_bytes,
        is_auto_path=is_auto_path,
        provider=provider,
        model_id=model_id,
    )

    return ok_result(
        out_path=str(final_out_path),
        provider=provider,
        model=model_id,
        **_format_metadata(asset_format),
        bytes=len(image_bytes),
        format=image_format,
        image_format=image_format,
        ms=int((time.monotonic() - started) * 1000),
    )


async def compare_providers(args: dict[str, Any]) -> dict[str, Any]:
    prompt_text, prompt_label = _read_prompt(_require_string(args, "prompt"))
    asset_format = _normalize_asset_format(args)
    references = _normalize_references(args)
    specs = args.get("specs")
    if not isinstance(specs, list) or not specs:
        raise ToolError(
            "validation",
            "`specs` must be a non-empty list of provider:model strings.",
            {"field": "specs"},
        )
    if len(specs) > MAX_COMPARE_SPECS:
        raise ToolError(
            "validation",
            f"`specs` must contain {MAX_COMPARE_SPECS} provider:model string(s) or fewer.",
            {"field": "specs", "max_items": MAX_COMPARE_SPECS},
        )

    out_dir = _output_dir(_optional_string(args, "out_dir"))
    provider_cache: dict[str, Any] = {}
    results: list[dict[str, Any]] = []

    for index, raw_spec in enumerate(specs, start=1):
        spec_started = time.monotonic()
        if not isinstance(raw_spec, str) or not raw_spec.strip():
            results.append(
                {
                    "spec": str(raw_spec),
                    "ok": False,
                    "ms": 0,
                    "kb": 0,
                    "error": {
                        "error_kind": "validation",
                        "message": "`specs` entries must be non-empty strings.",
                    },
                }
            )
            continue

        spec = raw_spec.strip()
        try:
            provider, model = parse_spec(spec)
            model_id = _validate_combo(provider, model, len(references))
            _validate_format_combo(provider, model_id, asset_format)
            if provider not in provider_cache:
                provider_cache[provider] = _build_provider(provider)
            provider_client = provider_cache[provider]
            image_bytes = await _call_provider(
                provider_client,
                prompt_text,
                references,
                model,
                aspect_ratio=ASSET_FORMATS[asset_format]["aspect_ratio"],
            )
            image_format = _validate_image_bytes(image_bytes, provider, model_id)
            filename = f"{index:02d}-{_slugify(provider)}-{_slugify(model)}.{image_format}"
            out_path = out_dir / filename
            if out_path.exists():
                raise ToolError(
                    "write_failed",
                    f"Output path already exists: {out_path}",
                    {"out_path": str(out_path)},
                )
            out_path.write_bytes(image_bytes)
            ms = int((time.monotonic() - spec_started) * 1000)
            results.append(
                {
                    "spec": spec,
                    "ok": True,
                    "file": filename,
                    "model": model_id,
                    **_format_metadata(asset_format),
                    "format": image_format,
                    "image_format": image_format,
                    "ms": ms,
                    "kb": len(image_bytes) // 1024,
                }
            )
        except ToolError as exc:
            results.append(
                {
                    "spec": spec,
                    "ok": False,
                    "ms": int((time.monotonic() - spec_started) * 1000),
                    "kb": 0,
                    "error": _compact_error(exc),
                }
            )
        except Exception as exc:
            results.append(
                {
                    "spec": spec,
                    "ok": False,
                    "ms": int((time.monotonic() - spec_started) * 1000),
                    "kb": 0,
                    "error": {
                        "error_kind": "provider_error",
                        "message": str(exc),
                    },
                }
            )

    gallery_path = _write_gallery(out_dir, prompt_label, references, results)
    return ok_result(
        gallery_path=str(gallery_path),
        out_dir=str(out_dir),
        **_format_metadata(asset_format),
        results=results,
    )


def list_models(args: dict[str, Any]) -> dict[str, Any]:
    provider_value = args.get("provider")
    provider: str | None = None
    if provider_value is not None:
        if not isinstance(provider_value, str) or not provider_value.strip():
            raise ToolError(
                "validation",
                "`provider` must be a non-empty string when provided.",
                {"field": "provider"},
            )
        provider = _normalize_provider(provider_value)

    matrix = _model_matrix()
    providers = {provider: matrix[provider]} if provider else matrix
    return ok_result(
        timeout_seconds=TIMEOUT_SECONDS,
        formats=_asset_format_matrix(),
        providers=providers,
    )
