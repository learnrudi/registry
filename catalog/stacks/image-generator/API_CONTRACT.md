# Image Generator API Contract

Version: `0.1.0`

This stack exposes MCP tools for agent-facing content image generation. The
contract is intentionally provider-portable: callers choose a provider and a
content-oriented preset or explicit model id, while provider SDK details stay
inside the stack.

## Common Result Envelope

Every tool returns JSON text with an `ok` boolean.

Success:

```json
{
  "ok": true
}
```

Failure:

```json
{
  "ok": false,
  "error_kind": "validation",
  "message": "Human-readable remediation text."
}
```

`error_kind` is stable enough for agents to branch on. Current values:

- `validation` - malformed, missing, unsafe, or out-of-range input
- `missing_secret` - required provider credential is not configured
- `unsupported_combo` - provider/model/reference combination is not supported
- `provider_error` - provider SDK or provider response failed
- `timeout` - provider call exceeded the stack timeout
- `write_failed` - generated output could not be written safely
- `unknown_tool` - MCP tool name is not supported
- `internal_error` - unexpected server failure after redaction

Validation errors include field details such as `field`, `allowed`,
`max_items`, `max_chars`, or `max_bytes` where useful.

## Shared Limits

| Limit | Value |
|---|---:|
| Prompt length | 20,000 characters |
| Reference count | 16 files |
| Reference size | 50 MB per file |
| Compare specs | 8 provider/model specs |
| Provider timeout | 120 seconds per provider call |

Prompts are always literal strings. The stack does not read prompt files.

Reference images must be local PNG, JPEG, or WebP files. URLs and data URLs are
rejected. Output paths must be under `~/.rudi/outputs`, and existing files are
not overwritten.

Content formats:

| Format | Aspect ratio | Notes |
|---|---:|---|
| `square` | `1:1` | Default feed image |
| `portrait` | `2:3` | Vertical feed image |
| `story` | `9:16` | Story or short-form vertical image |
| `landscape` | `3:2` | Landscape preview or thumbnail image |

OpenAI `story` output is supported with `gpt-image-2`. Older OpenAI image
models return `unsupported_combo` for `format: "story"`. Gemini and verified
Replicate FLUX defaults use provider-native aspect ratio controls.

## `list_models`

Purpose: return provider presets, active model ids, aliases, reference support,
and credential readiness without making provider API calls.

Request:

```json
{
  "provider": "openai"
}
```

`provider` is optional. Allowed values are `gemini`, `openai`, and
`replicate`.

Response shape:

```json
{
  "ok": true,
  "timeout_seconds": 120,
  "formats": {
    "square": {
      "aspect_ratio": "1:1",
      "description": "Square feed image."
    }
  },
  "providers": {
    "openai": {
      "secret": "OPENAI_API_KEY",
      "secret_status": {
        "env": "OPENAI_API_KEY",
        "configured": true,
        "required_for_generation": true
      },
      "default_preset": "photoreal",
      "presets": {
        "photoreal": {
          "default_model": "gpt-image-2",
          "active_model": "gpt-image-2",
          "references": {
            "supported": true,
            "max_references": 16,
            "multi_reference": true,
            "rule": "OpenAI references require GPT Image/chatgpt-image models (up to 16 refs) or dall-e-2 (one ref)."
          }
        }
      },
      "known_models": {
        "gpt-image-2": {
          "status": "current",
          "default_for": ["sketch", "photoreal", "edit"]
        },
        "gpt-image-1.5": {
          "status": "legacy",
          "default_for": []
        }
      }
    }
  }
}
```

`secret_status.configured` only checks whether the named environment variable
is present. It does not validate account access or model availability.

Replicate provider data also includes `release_status: "beta"`,
`stability: "model-specific"`, and `beta_reason`. Replicate aliases include a
`status` field so agents can distinguish stack-known beta models from unverified
alias targets.

## `generate_image`

Purpose: generate one image with one provider and write it to a local file.

Request:

```json
{
  "provider": "openai",
  "prompt": "A clean square product image for a social post.",
  "model": "photoreal",
  "format": "square",
  "references": ["/Users/example/.rudi/outputs/reference.png"],
  "out_path": "/Users/example/.rudi/outputs/post-image.png"
}
```

Fields:

| Field | Required | Notes |
|---|---:|---|
| `provider` | yes | `gemini`, `openai`, or `replicate` |
| `prompt` | yes | literal prompt text, 1 to 20,000 characters |
| `model` | no | preset or explicit model id, defaults to `photoreal` |
| `format` | no | `square`, `portrait`, `story`, or `landscape`; defaults to `square` |
| `references` | no | local PNG/JPEG/WebP image paths, maximum 16 |
| `out_path` | no | file path under `~/.rudi/outputs`; auto path if omitted |

Success response:

```json
{
  "ok": true,
  "out_path": "/Users/example/.rudi/outputs/image-20260517-120000-a1b2c3d4.png",
  "provider": "openai",
  "model": "gpt-image-2",
  "asset_format": "square",
  "aspect_ratio": "1:1",
  "bytes": 123456,
  "format": "png",
  "image_format": "png",
  "ms": 5230
}
```

Common error response:

```json
{
  "ok": false,
  "error_kind": "missing_secret",
  "message": "OPENAI_API_KEY is not set. Set it with `rudi secrets set OPENAI_API_KEY <key>` before using openai.",
  "provider": "openai",
  "secret_name": "OPENAI_API_KEY",
  "remediation": "Run `rudi secrets set OPENAI_API_KEY <key>` and restart the RUDI router."
}
```

## `compare_providers`

Purpose: run one prompt across up to eight provider/model specs and write a
local HTML gallery.

Request:

```json
{
  "prompt": "Editorial social graphic about planning a week of content.",
  "format": "portrait",
  "specs": ["gemini:sketch", "openai:photoreal", "replicate:flux-2"],
  "out_dir": "/Users/example/.rudi/outputs/compare-run"
}
```

Fields:

| Field | Required | Notes |
|---|---:|---|
| `prompt` | yes | literal prompt text, 1 to 20,000 characters |
| `specs` | yes | non-empty list of `provider:model` strings, maximum 8 |
| `format` | no | `square`, `portrait`, `story`, or `landscape`; defaults to `square` |
| `references` | no | local PNG/JPEG/WebP image paths, maximum 16 |
| `out_dir` | no | empty directory under `~/.rudi/outputs`; auto directory if omitted |

Success response:

```json
{
  "ok": true,
  "gallery_path": "/Users/example/.rudi/outputs/compare-run/index.html",
  "out_dir": "/Users/example/.rudi/outputs/compare-run",
  "asset_format": "portrait",
  "aspect_ratio": "2:3",
  "results": [
    {
      "spec": "openai:photoreal",
      "ok": true,
      "file": "01-openai-photoreal.png",
      "model": "gpt-image-2",
      "asset_format": "portrait",
      "aspect_ratio": "2:3",
      "format": "png",
      "image_format": "png",
      "ms": 5230,
      "kb": 120
    },
    {
      "spec": "gemini:edit",
      "ok": false,
      "ms": 2,
      "kb": 0,
      "error": {
        "error_kind": "unsupported_combo",
        "message": "Gemini does not define an `edit` preset. Use sketch, photoreal, or an explicit Gemini model id.",
        "provider": "gemini",
        "model": "edit"
      }
    }
  ]
}
```

Per-spec provider failures are captured in `results`; the comparison continues
and still returns `ok: true` if the gallery can be written. Request-level
validation failures, such as too many `specs`, return the common failure
envelope instead.
