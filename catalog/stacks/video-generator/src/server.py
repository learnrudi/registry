#!/usr/bin/env python3
"""Video Generator MCP Server."""

from __future__ import annotations

import asyncio
import json
import os
from typing import Any

from mcp import types
from mcp.server import Server
from mcp.server.stdio import stdio_server

from constants import (
    ALLOWED_DURATIONS_SECONDS,
    JOB_TIMEOUT_SECONDS,
    MAX_PROMPT_CHARS,
    MAX_REFERENCE_COUNT,
    MAX_SOURCE_VIDEO_BYTES,
    SECRET_ENV_BY_PROVIDER,
    VIDEO_FORMATS,
    VIDEO_INPUT_MODES,
)
from errors import ToolError, error_result
from renderer.providers import PROVIDERS
from tools import generate_video, get_video_job, list_video_models


server = Server("video-generator")
SECRET_ENV_NAMES = tuple(
    SECRET_ENV_BY_PROVIDER.values()
)


def safe_exception_detail(exc: Exception) -> str:
    detail = str(exc) or type(exc).__name__
    for name in SECRET_ENV_NAMES:
        value = os.environ.get(name)
        if value and len(value) >= 8:
            detail = detail.replace(value, "[redacted]")
    return detail[:2000]


def json_content(result: dict[str, Any]) -> list[types.TextContent]:
    return [
        types.TextContent(
            type="text",
            text=json.dumps(result, indent=2, sort_keys=False),
        )
    ]


@server.list_tools()
async def list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="list_video_models",
            description=(
                "Return static video provider model ids, aliases, capabilities, "
                "and secret readiness. Makes no provider API calls."
            ),
            inputSchema={
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "provider": {
                        "type": "string",
                        "enum": list(PROVIDERS),
                        "description": "Optional provider filter.",
                    },
                },
            },
        ),
        types.Tool(
            name="generate_video",
            description=(
                "Generate one video with Gemini/Veo, Replicate beta models, "
                "fal beta models, or OpenAI Sora legacy models. Provider jobs "
                f"may poll up to {JOB_TIMEOUT_SECONDS} seconds."
            ),
            inputSchema={
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "provider": {
                        "type": "string",
                        "enum": list(PROVIDERS),
                        "description": "Provider to use.",
                    },
                    "prompt": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": MAX_PROMPT_CHARS,
                        "description": "Literal prompt text. File paths are treated as prompt text.",
                    },
                    "model": {
                        "type": "string",
                        "description": "Provider alias, default, or explicit model id. Defaults to default.",
                    },
                    "format": {
                        "type": "string",
                        "enum": list(VIDEO_FORMATS),
                        "description": "Content format. Defaults to story.",
                    },
                    "duration_seconds": {
                        "type": "integer",
                        "enum": list(ALLOWED_DURATIONS_SECONDS),
                        "description": "Normalized video duration in seconds.",
                    },
                    "mode": {
                        "type": "string",
                        "enum": list(VIDEO_INPUT_MODES),
                        "description": "Input mode. Defaults from provided media: text, image, interpolate, references, or extend.",
                    },
                    "references": {
                        "type": "array",
                        "maxItems": MAX_REFERENCE_COUNT,
                        "items": {"type": "string"},
                        "description": "Optional local PNG, JPEG, or WebP reference image file paths.",
                    },
                    "input_image": {
                        "type": "string",
                        "description": "Optional local PNG, JPEG, or WebP first-frame image path for image/interpolate modes.",
                    },
                    "end_image": {
                        "type": "string",
                        "description": "Optional local PNG, JPEG, or WebP last-frame image path for interpolate mode.",
                    },
                    "source_video": {
                        "type": "string",
                        "description": f"Optional local MP4/WebM source video path for extend mode, max {MAX_SOURCE_VIDEO_BYTES} bytes. Gemini requires a previous Veo output with metadata sidecar.",
                    },
                    "out_path": {
                        "type": "string",
                        "description": "Optional output path under ~/.rudi/outputs ending in .mp4 or .webm.",
                    },
                },
                "required": ["provider", "prompt"],
            },
        ),
        types.Tool(
            name="get_video_job",
            description=(
                "Inspect a provider video job. If complete, download and write "
                "the video under ~/.rudi/outputs."
            ),
            inputSchema={
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "provider": {
                        "type": "string",
                        "enum": list(PROVIDERS),
                        "description": "Provider that owns the job.",
                    },
                    "job_id": {
                        "type": "string",
                        "minLength": 1,
                        "description": "Provider job id.",
                    },
                    "out_path": {
                        "type": "string",
                        "description": "Optional output path under ~/.rudi/outputs ending in .mp4 or .webm.",
                    },
                },
                "required": ["provider", "job_id"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict | None) -> list[types.TextContent]:
    args = arguments or {}
    try:
        if name == "list_video_models":
            return json_content(list_video_models(args))
        if name == "generate_video":
            return json_content(await generate_video(args))
        if name == "get_video_job":
            return json_content(await get_video_job(args))
        return json_content(error_result("unknown_tool", f"Unknown tool: {name}"))
    except ToolError as exc:
        return json_content(exc.to_result())
    except Exception as exc:
        return json_content(
            error_result(
                "internal_error",
                "Video generator failed unexpectedly.",
                exception_type=type(exc).__name__,
                detail=safe_exception_detail(exc),
            )
        )


async def main() -> None:
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            server.create_initialization_options(),
        )


if __name__ == "__main__":
    asyncio.run(main())
