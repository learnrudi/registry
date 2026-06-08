#!/usr/bin/env python3
"""Image Generator MCP Server."""

from __future__ import annotations

import asyncio
import json
import os
from typing import Any

from mcp import types
from mcp.server import Server
from mcp.server.stdio import stdio_server

from errors import ToolError, error_result
from tools import (
    ASSET_FORMATS,
    MAX_COMPARE_SPECS,
    MAX_PROMPT_CHARS,
    MAX_REFERENCE_COUNT,
    compare_providers,
    generate_image,
    list_models,
)


server = Server("image-generator")
SECRET_ENV_NAMES = ("GEMINI_API_KEY", "OPENAI_API_KEY", "REPLICATE_API_TOKEN")


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
            name="generate_image",
            description=(
                "Generate one image with Gemini, OpenAI, or Replicate. "
                "Reference support is validated before dispatch. Provider "
                "calls have a 120 second timeout."
            ),
            inputSchema={
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "provider": {
                        "type": "string",
                        "enum": ["gemini", "openai", "replicate"],
                        "description": "Provider to use.",
                    },
                    "prompt": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": MAX_PROMPT_CHARS,
                        "description": "Prompt text. File paths are treated as literal prompt text.",
                    },
                    "model": {
                        "type": "string",
                        "description": "Preset (sketch, photoreal, edit) or explicit model id. Defaults to photoreal.",
                    },
                    "format": {
                        "type": "string",
                        "enum": list(ASSET_FORMATS),
                        "description": "Content asset format. Defaults to square.",
                    },
                    "references": {
                        "type": "array",
                        "maxItems": MAX_REFERENCE_COUNT,
                        "items": {"type": "string"},
                        "description": "Optional local PNG, JPEG, or WebP reference image file paths.",
                    },
                    "out_path": {
                        "type": "string",
                        "description": "Optional output file path under ~/.rudi/outputs. Defaults to ~/.rudi/outputs/image-<ts>-<nonce>.<detected-format>.",
                    },
                },
                "required": ["provider", "prompt"],
            },
        ),
        types.Tool(
            name="compare_providers",
            description=(
                "Generate the same prompt across provider:model specs and "
                "write an HTML gallery. Per-spec failures are returned in "
                "results while the run continues. Provider calls have a 120 "
                "second timeout each."
            ),
            inputSchema={
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "prompt": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": MAX_PROMPT_CHARS,
                        "description": "Prompt text. File paths are treated as literal prompt text.",
                    },
                    "specs": {
                        "type": "array",
                        "minItems": 1,
                        "maxItems": MAX_COMPARE_SPECS,
                        "items": {"type": "string"},
                        "description": "Provider/model specs such as gemini:sketch or replicate:flux-2.",
                    },
                    "format": {
                        "type": "string",
                        "enum": list(ASSET_FORMATS),
                        "description": "Content asset format applied to every spec. Defaults to square.",
                    },
                    "references": {
                        "type": "array",
                        "maxItems": MAX_REFERENCE_COUNT,
                        "items": {"type": "string"},
                        "description": "Optional local PNG, JPEG, or WebP reference image file paths.",
                    },
                    "out_dir": {
                        "type": "string",
                        "description": "Optional empty output directory under ~/.rudi/outputs. Defaults to ~/.rudi/outputs/compare-<ts>/.",
                    },
                },
                "required": ["prompt", "specs"],
            },
        ),
        types.Tool(
            name="list_models",
            description=(
                "Return static provider presets, default model ids, aliases, "
                "and reference-image support. Makes no provider API calls."
            ),
            inputSchema={
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "provider": {
                        "type": "string",
                        "enum": ["gemini", "openai", "replicate"],
                        "description": "Optional provider filter.",
                    },
                },
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict | None) -> list[types.TextContent]:
    args = arguments or {}
    try:
        if name == "generate_image":
            return json_content(await generate_image(args))
        if name == "compare_providers":
            return json_content(await compare_providers(args))
        if name == "list_models":
            return json_content(list_models(args))
        return json_content(error_result("unknown_tool", f"Unknown tool: {name}"))
    except ToolError as exc:
        return json_content(exc.to_result())
    except Exception as exc:
        return json_content(
            error_result(
                "internal_error",
                "Image generator failed unexpectedly.",
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
