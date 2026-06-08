"""Secret lookup, provider construction, and timeout-bounded calls."""

from __future__ import annotations

import asyncio
import os
from typing import Any

from constants import PROVIDER_CALL_TIMEOUT_SECONDS, SECRET_ENV_BY_PROVIDER
from errors import ToolError
from renderer.providers import get_provider


def secret_status(provider: str) -> dict[str, Any]:
    name = SECRET_ENV_BY_PROVIDER[provider]
    return {
        "env": name,
        "configured": bool(os.environ.get(name)),
        "required_for_generation": True,
    }


def require_secret(provider: str) -> tuple[str, str]:
    name = SECRET_ENV_BY_PROVIDER[provider]
    value = os.environ.get(name)
    if value:
        return name, value

    raise ToolError(
        "missing_secret",
        f"{name} is not set. Set it before using {provider}.",
        {
            "provider": provider,
            "secret_name": name,
            "remediation": f"Run `rudi secrets set {name} <key>` and restart the RUDI router.",
        },
    )


def build_provider(provider: str):
    secret_name, secret_value = require_secret(provider)
    try:
        if provider == "replicate":
            return get_provider(provider, api_token=secret_value)
        return get_provider(provider, api_key=secret_value)
    except Exception as exc:
        raise ToolError(
            "provider_error",
            f"{provider} client failed to initialize: {exc}",
            {"provider": provider, "secret_name": secret_name},
        ) from exc


async def call_provider_method(
    provider_client: Any,
    method_name: str,
    *args: Any,
    timeout_seconds: int = PROVIDER_CALL_TIMEOUT_SECONDS,
    **kwargs: Any,
) -> Any:
    method = getattr(provider_client, method_name)
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(method, *args, **kwargs),
            timeout=timeout_seconds,
        )
    except asyncio.TimeoutError as exc:
        raise ToolError(
            "timeout",
            f"Provider call `{method_name}` exceeded {timeout_seconds} seconds.",
            {"timeout_seconds": timeout_seconds, "method": method_name},
        ) from exc
