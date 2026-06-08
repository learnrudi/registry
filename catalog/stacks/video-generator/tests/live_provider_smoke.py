#!/usr/bin/env python3
"""Explicit live smoke runner for video providers.

This script is intentionally not named test_*.py so default unit-test discovery
does not call paid provider APIs.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import uuid
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from constants import DEFAULT_OUTPUT_DIR  # noqa: E402
from model_registry import list_video_models  # noqa: E402
from provider_runtime import secret_status  # noqa: E402
from renderer.providers import PROVIDERS  # noqa: E402
from tools import generate_video  # noqa: E402


DEFAULT_PROMPT = (
    "Short vertical product reveal video. Clean tabletop, slow dolly in, "
    "soft studio light, no text."
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run explicit live video provider smoke tests.")
    provider_group = parser.add_mutually_exclusive_group(required=True)
    provider_group.add_argument("--provider", choices=PROVIDERS)
    provider_group.add_argument("--all-configured", action="store_true")
    parser.add_argument("--model", default="default")
    parser.add_argument("--format", choices=("story", "landscape"), default="story")
    parser.add_argument("--duration", type=int)
    parser.add_argument("--prompt", default=DEFAULT_PROMPT)
    parser.add_argument("--mode", choices=("text", "image", "interpolate", "references", "extend"))
    parser.add_argument("--reference", action="append", default=[])
    parser.add_argument("--input-image")
    parser.add_argument("--end-image")
    parser.add_argument("--source-video")
    parser.add_argument("--confirm-cost", action="store_true")
    return parser.parse_args()


def output_path(provider: str, model: str) -> str:
    safe_model = model.replace("/", "-").replace(":", "-")
    return str(DEFAULT_OUTPUT_DIR / f"video-smoke-{provider}-{safe_model}-{uuid.uuid4().hex[:8]}.mp4")


def configured_providers(all_configured: bool, provider: str | None) -> list[str]:
    if provider:
        return [provider]
    if not all_configured:
        return []
    return [name for name in PROVIDERS if secret_status(name)["configured"]]


async def run_one(args: argparse.Namespace, provider: str) -> dict:
    if not secret_status(provider)["configured"]:
        return {
            "ok": False,
            "skipped": True,
            "provider": provider,
            "reason": f"{secret_status(provider)['env']} is not set.",
        }

    request = {
        "provider": provider,
        "prompt": args.prompt,
        "model": args.model,
        "format": args.format,
        "references": args.reference,
        "out_path": output_path(provider, args.model),
    }
    if args.mode:
        request["mode"] = args.mode
    if args.input_image:
        request["input_image"] = args.input_image
    if args.end_image:
        request["end_image"] = args.end_image
    if args.source_video:
        request["source_video"] = args.source_video
    if args.duration is not None:
        request["duration_seconds"] = args.duration
    return await generate_video(request)


async def main() -> int:
    args = parse_args()
    if not args.confirm_cost:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error_kind": "confirmation_required",
                    "message": "Live provider smoke tests can incur provider costs. Re-run with --confirm-cost.",
                    "models": list_video_models({}),
                },
                indent=2,
            )
        )
        return 2

    providers = configured_providers(args.all_configured, args.provider)
    if not providers:
        print(
            json.dumps(
                {
                    "ok": False,
                    "skipped": True,
                    "message": "No configured providers found.",
                    "models": list_video_models({}),
                },
                indent=2,
            )
        )
        return 0

    results = []
    exit_code = 0
    for provider in providers:
        try:
            result = await run_one(args, provider)
        except Exception as exc:
            result = {
                "ok": False,
                "provider": provider,
                "error_kind": type(exc).__name__,
                "message": str(exc),
            }
        if not result.get("ok") and not result.get("skipped"):
            exit_code = 1
        results.append(result)

    print(json.dumps({"ok": exit_code == 0, "results": results}, indent=2))
    return exit_code


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
