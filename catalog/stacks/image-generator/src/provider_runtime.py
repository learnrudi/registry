"""Provider client construction and timeout-bounded execution."""

from __future__ import annotations

import asyncio
import os
from pathlib import Path

from constants import SECRET_BY_PROVIDER, TIMEOUT_SECONDS
from errors import ToolError
from renderer.providers import get_provider


def require_secret(provider: str) -> str:
    secret_name = SECRET_BY_PROVIDER[provider]
    secret_value = os.environ.get(secret_name)
    if not secret_value:
        raise ToolError(
            "missing_secret",
            f"{secret_name} is not set. Set it with `rudi secrets set {secret_name} <key>` before using {provider}.",
            {
                "provider": provider,
                "secret_name": secret_name,
                "remediation": f"Run `rudi secrets set {secret_name} <key>` and restart the RUDI router.",
            },
        )
    return secret_value


def build_provider(provider: str):
    secret = require_secret(provider)
    try:
        if provider == "replicate":
            return get_provider(provider, api_token=secret)
        return get_provider(provider, api_key=secret)
    except Exception as exc:
        raise ToolError(
            "provider_error",
            f"{provider} client failed to initialize: {exc}",
            {"provider": provider},
        ) from exc


async def call_provider(
    provider_client,
    prompt: str,
    references: list[Path],
    model: str,
    aspect_ratio: str | None = None,
) -> bytes:
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(
                provider_client.generate_image,
                prompt=prompt,
                reference=references or None,
                model=model,
                aspect_ratio=aspect_ratio,
            ),
            timeout=TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError as exc:
        raise ToolError(
            "timeout",
            f"Provider call exceeded {TIMEOUT_SECONDS} seconds.",
            {"timeout_seconds": TIMEOUT_SECONDS},
        ) from exc
