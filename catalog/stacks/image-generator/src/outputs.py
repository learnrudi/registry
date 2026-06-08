"""Output path policy and generated image byte handling."""

from __future__ import annotations

import time
import uuid
from pathlib import Path

from constants import DEFAULT_OUTPUT_DIR, IMAGE_SIGNATURES
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
    else:
        out_path = DEFAULT_OUTPUT_DIR / f"image-{timestamp()}-{nonce()}"
        is_auto = True
    ensure_output_path(out_path, "out_path")
    if out_path.exists():
        raise ToolError(
            "validation",
            f"Output path already exists: {out_path}",
            {"field": "out_path", "path": str(out_path)},
        )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    return out_path, is_auto


def output_dir(value: str | None) -> Path:
    out_dir = expand_path(value) if value else DEFAULT_OUTPUT_DIR / f"compare-{timestamp()}-{nonce()}"
    ensure_output_path(out_dir, "out_dir")
    if out_dir.exists() and not out_dir.is_dir():
        raise ToolError(
            "validation",
            f"Output directory path exists and is not a directory: {out_dir}",
            {"field": "out_dir", "path": str(out_dir)},
        )
    if out_dir.exists() and any(out_dir.iterdir()):
        raise ToolError(
            "validation",
            f"Output directory must be empty: {out_dir}",
            {"field": "out_dir", "path": str(out_dir)},
        )
    out_dir.mkdir(parents=True, exist_ok=True)
    return out_dir


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


def path_for_detected_format(out_path: Path, image_format: str, is_auto: bool) -> Path:
    if not is_auto:
        return out_path
    ext = f".{image_format}" if image_format != "jpg" else ".jpg"
    return out_path.with_suffix(ext)


def validate_image_bytes(image_bytes: bytes, provider: str, model_id: str) -> str:
    image_format = detect_image_format(image_bytes)
    if image_format == "bin":
        raise ToolError(
            "provider_error",
            f"{provider} returned bytes that do not look like an image.",
            {"provider": provider, "model": model_id},
        )
    return image_format


def safe_write_image(
    out_path: Path,
    image_bytes: bytes,
    *,
    is_auto_path: bool,
    provider: str,
    model_id: str,
) -> tuple[Path, str]:
    image_format = validate_image_bytes(image_bytes, provider, model_id)
    final_out_path = path_for_detected_format(out_path, image_format, is_auto_path)
    if final_out_path.exists():
        raise ToolError(
            "write_failed",
            f"Output path already exists: {final_out_path}",
            {"out_path": str(final_out_path)},
        )

    try:
        final_out_path.write_bytes(image_bytes)
    except OSError as exc:
        raise ToolError(
            "write_failed",
            f"Could not write generated image to {final_out_path}: {exc}",
            {"out_path": str(final_out_path)},
        ) from exc

    return final_out_path, image_format
