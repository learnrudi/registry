#!/usr/bin/env python3
"""RUDI Processor MCP-compatible JSON-RPC server."""

from __future__ import annotations

import contextlib
import io
import json
import os
import sys
from pathlib import Path
from typing import Any, Callable

STACK_ROOT = Path(__file__).resolve().parents[1]
if str(STACK_ROOT) not in sys.path:
    sys.path.insert(0, str(STACK_ROOT))


TOOLS = [
    {
        "name": "rudi_process_file",
        "description": "Extract Stage 1 metadata from a local file and optionally save it into the RUDI processor index.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Path to the local file to process."
                },
                "save": {
                    "type": "boolean",
                    "description": "Whether to save metadata to the configured index. Defaults to true."
                },
                "output_dir": {
                    "type": "string",
                    "description": "Optional metadata output directory. Defaults to the configured RUDI index."
                }
            },
            "required": ["file_path"]
        }
    },
    {
        "name": "rudi_audit_files",
        "description": "Audit the configured RUDI processor inbox against the metadata manifest.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "include_details": {
                    "type": "boolean",
                    "description": "Include processed/unprocessed/missing file details. Defaults to false."
                }
            }
        }
    },
    {
        "name": "rudi_search_index",
        "description": "Search indexed RUDI processor metadata content.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query."
                },
                "index_path": {
                    "type": "string",
                    "description": "Optional index directory. Defaults to configured RUDI processor index."
                }
            },
            "required": ["query"]
        }
    },
    {
        "name": "rudi_processor_config",
        "description": "Return the effective RUDI processor configuration with filesystem paths and processing options.",
        "inputSchema": {
            "type": "object",
            "properties": {}
        }
    }
]


def expand_path(value: str) -> str:
    return str(Path(os.path.expandvars(os.path.expanduser(value))).resolve())


def require_string(args: dict[str, Any], key: str) -> str:
    value = args.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{key} is required")
    return value.strip()


def capture_stdout(fn: Callable[[], Any]) -> tuple[Any, str]:
    buffer = io.StringIO()
    with contextlib.redirect_stdout(buffer):
        result = fn()
    return result, buffer.getvalue().strip()


def process_file(args: dict[str, Any]) -> dict[str, Any]:
    file_path = expand_path(require_string(args, "file_path"))
    save = args.get("save", True)
    if not isinstance(save, bool):
        raise ValueError("save must be a boolean when provided")

    def run() -> dict[str, Any]:
        from metadata_processor import MetadataProcessor

        processor = MetadataProcessor()
        metadata = processor.process_file(file_path)
        response: dict[str, Any] = {
            "success": bool(metadata.get("processing_status", {}).get("python_processed")),
            "metadata": metadata
        }

        if save:
            output_dir = args.get("output_dir")
            if output_dir is not None and not isinstance(output_dir, str):
                raise ValueError("output_dir must be a string when provided")
            response["output_path"] = processor.save_metadata(
                metadata,
                expand_path(output_dir) if output_dir else None
            )

        return response

    result, stdout = capture_stdout(run)
    if stdout:
        result["log"] = stdout
    return result


def audit_files(args: dict[str, Any]) -> dict[str, Any]:
    include_details = args.get("include_details", False)
    if not isinstance(include_details, bool):
        raise ValueError("include_details must be a boolean when provided")

    def run() -> dict[str, Any]:
        from tools.rudi_audit import RUDIAuditor

        auditor = RUDIAuditor()
        auditor.rudi_path.mkdir(parents=True, exist_ok=True)
        auditor.index_path.mkdir(parents=True, exist_ok=True)
        processed, unprocessed, missing = auditor.audit_files()
        response: dict[str, Any] = {
            "success": True,
            "summary": {
                "total_files": len(processed) + len(unprocessed) + len(missing),
                "processed": len(processed),
                "unprocessed": len(unprocessed),
                "missing_metadata": len(missing)
            }
        }
        if include_details:
            response["processed_files"] = processed
            response["unprocessed_files"] = unprocessed
            response["missing_metadata_files"] = missing
        return response

    result, stdout = capture_stdout(run)
    if stdout:
        result["log"] = stdout
    return result


def search_index(args: dict[str, Any]) -> dict[str, Any]:
    query = require_string(args, "query")
    index_path = args.get("index_path")
    if index_path is not None and not isinstance(index_path, str):
        raise ValueError("index_path must be a string when provided")

    def run() -> dict[str, Any]:
        from tools.search_rudi import search_content

        results = search_content(query, expand_path(index_path)) if index_path else search_content(query)
        return {
            "success": True,
            "query": query,
            "count": len(results),
            "results": results
        }

    result, stdout = capture_stdout(run)
    if stdout:
        result["log"] = stdout
    return result


def processor_config(_args: dict[str, Any]) -> dict[str, Any]:
    def run() -> dict[str, Any]:
        from config import config

        return {
            "success": True,
            "config": config.to_dict()
        }

    result, stdout = capture_stdout(run)
    if stdout:
        result["log"] = stdout
    return result


def handle_tool_call(name: str, args: dict[str, Any]) -> dict[str, Any]:
    if name == "rudi_process_file":
        return process_file(args)
    if name == "rudi_audit_files":
        return audit_files(args)
    if name == "rudi_search_index":
        return search_index(args)
    if name == "rudi_processor_config":
        return processor_config(args)
    return {"success": False, "message": f"Unknown tool: {name}"}


def response_for(request: dict[str, Any]) -> dict[str, Any]:
    method = request.get("method")

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": request.get("id"),
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "serverInfo": {
                    "name": "rudi-processor",
                    "version": "2.0.0"
                }
            }
        }

    if method == "tools/list":
        return {
            "jsonrpc": "2.0",
            "id": request.get("id"),
            "result": {"tools": TOOLS}
        }

    if method == "tools/call":
        params = request.get("params", {})
        if not isinstance(params, dict):
            raise ValueError("params must be an object")
        tool_name = params.get("name")
        tool_args = params.get("arguments", {})
        if not isinstance(tool_name, str):
            raise ValueError("params.name must be a string")
        if not isinstance(tool_args, dict):
            raise ValueError("params.arguments must be an object")

        result = handle_tool_call(tool_name, tool_args)
        return {
            "jsonrpc": "2.0",
            "id": request.get("id"),
            "result": {
                "content": [
                    {
                        "type": "text",
                        "text": json.dumps(result, indent=2, default=str)
                    }
                ]
            }
        }

    return {
        "jsonrpc": "2.0",
        "id": request.get("id"),
        "error": {
            "code": -32601,
            "message": f"Method not found: {method}"
        }
    }


def main() -> None:
    for line in sys.stdin:
        request_id = None
        try:
            request = json.loads(line)
            if not isinstance(request, dict):
                raise ValueError("request must be an object")
            request_id = request.get("id")
            response = response_for(request)
        except Exception as exc:
            response = {
                "jsonrpc": "2.0",
                "id": request_id,
                "error": {
                    "code": -32603,
                    "message": f"Internal error: {exc}"
                }
            }
        print(json.dumps(response), flush=True)


if __name__ == "__main__":
    main()
