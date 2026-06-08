# Video Generator API Contract

Version: `0.1.0`

This stack exposes MCP tools for agent-facing video generation. It is a
separate stack from `image-generator`; image generation code and video
generation code must not share provider dispatch modules.

The contract is provider-portable. Callers provide normalized fields such as
`provider`, `model`, `format`, `duration_seconds`, `mode`, `references`,
`input_image`, `end_image`, `source_video`, and `out_path`; provider SDK
details, provider-specific request fields, and polling mechanics stay inside
the stack.

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

Current `error_kind` values:

- `validation` - malformed, missing, unsafe, or out-of-range input
- `missing_secret` - required provider credential is not configured
- `unsupported_combo` - provider/model/format/reference/duration combination is not supported
- `provider_error` - provider SDK or provider response failed
- `timeout` - provider job did not complete before the stack timeout
- `write_failed` - generated output could not be written safely
- `unknown_tool` - MCP tool name is not supported
- `internal_error` - unexpected server failure after redaction

Validation errors include field details such as `field`, `allowed`,
`max_items`, `max_chars`, or `max_bytes` where useful.

## Shared Limits

| Limit | Value |
|---|---:|
| Prompt length | 4,000 characters |
| Reference count | 3 files |
| Reference size | 20 MB per file |
| Source video size | 300 MB per file |
| Provider job timeout | 420 seconds |
| Poll interval | 10 seconds |

Prompts are always literal strings. The stack does not read prompt files.

Reference files must be local PNG, JPEG, or WebP image files. URLs and data
URLs are rejected. `input_image` and `end_image` use the same image validation.
`source_video` must be a local MP4 or WebM file. Provider adapters may require
provider provenance metadata for source-video workflows; Gemini/Veo extension
requires a recent Veo-generated output with its `.metadata.json` sidecar.
Output paths must be under `~/.rudi/outputs`, and existing files are not
overwritten.

Content formats:

| Format | Aspect ratio | Notes |
|---|---:|---|
| `story` | `9:16` | Default short-form vertical video |
| `landscape` | `16:9` | Widescreen video |

Generated files must be MP4 or WebM bytes. The current default output extension
is `.mp4`.

Input modes:

| Mode | Media fields | Notes |
|---|---|---|
| `text` | none | Prompt-only text-to-video; default when no media input is provided |
| `image` | `input_image` | First-frame image-to-video |
| `interpolate` | `input_image`, `end_image` | First-frame plus last-frame interpolation |
| `references` | `references` | Reference images for subject, style, or composition guidance |
| `extend` | `source_video` | Extend a source MP4/WebM video; Gemini requires a previous Veo output with metadata sidecar |

If `mode` is omitted, the stack infers it from the provided media fields.
Providing `references` without `mode` preserves the original behavior and
selects `references` mode.

## Provider Positioning

Gemini/Veo is the default provider because the Gemini API exposes Veo as a
provider-style long-running job API with current model docs.

Replicate models are beta from this stack's point of view. They are public
hosted models with model-specific input schemas, not one stable generic video
API. Each supported Replicate model is adapted explicitly. Some Replicate
image-to-video models ignore the requested `format` and follow the source
image's aspect ratio; model metadata documents those cases and the stack
validates matching source-image aspect ratio before provider dispatch.

fal is also beta from this stack's point of view. It is a hosted provider
platform with model endpoints split by mode. Seedance 2.0 is mapped explicitly
from normalized modes to fal endpoint ids: text-to-video, image-to-video,
first/last-frame interpolation through image-to-video, and reference-to-video.
The adapter is not promoted until live smoke tests pass with `FAL_KEY`.

OpenAI Sora is included only as a legacy optional adapter. OpenAI still exposes
Videos API docs, but the current OpenAI model catalog marks Sora 2 models as
deprecated/legacy, so this stack must not promote Sora to a default.

## `list_video_models`

Purpose: return static provider defaults, model ids, aliases, capability
metadata, and credential readiness without making provider API calls.

Request:

```json
{
  "provider": "gemini"
}
```

`provider` is optional. Allowed values are `gemini`, `replicate`, `fal`, and
`openai`.

Response shape:

```json
{
  "ok": true,
  "timeout_seconds": 420,
  "formats": {
    "story": {
      "aspect_ratio": "9:16",
      "description": "Short-form vertical video."
    }
  },
  "providers": {
    "gemini": {
      "label": "Gemini / Veo",
      "rollout_stage": "primary",
      "provider_type": "first_party_api",
      "docs_url": "https://ai.google.dev/gemini-api/docs/video",
      "secret": "GEMINI_API_KEY",
      "secret_status": {
        "env": "GEMINI_API_KEY",
        "configured": true,
        "required_for_generation": true
      },
      "default_model": "veo-3.1-generate-preview",
      "models": {
        "veo-3.1-generate-preview": {
          "label": "Veo 3.1 Preview",
          "status": "current_preview",
          "default": true,
          "formats": ["story", "landscape"],
          "modes": {
            "text": {
              "supported": true
            },
            "image": {
              "supported": true
            },
            "interpolate": {
              "supported": true
            },
            "references": {
              "supported": true,
              "max_references": 3,
              "multi_reference": true
            },
            "extend": {
              "supported": true
            }
          },
          "durations": [4, 6, 8],
          "references": {
            "supported": true,
            "max_references": 3,
            "multi_reference": true
          }
        }
      }
    }
  }
}
```

`secret_status.configured` only checks whether the named environment variable
is present. It does not validate account access or model availability.

## `generate_video`

Purpose: generate one video with one provider and write it to a local file.

Request:

```json
{
  "provider": "gemini",
  "prompt": "Short vertical product reveal video.",
  "model": "default",
  "format": "story",
  "mode": "references",
  "duration_seconds": 8,
  "references": ["/Users/example/.rudi/outputs/frame.png"],
  "out_path": "/Users/example/.rudi/outputs/video.mp4"
}
```

Fields:

| Field | Required | Notes |
|---|---:|---|
| `provider` | yes | `gemini`, `replicate`, `fal`, or `openai` |
| `prompt` | yes | literal prompt text, 1 to 4,000 characters |
| `model` | no | `default`, provider alias, or explicit model id; defaults to `default` |
| `format` | no | `story` or `landscape`; defaults to `story` |
| `duration_seconds` | no | integer duration; defaults to the selected model default |
| `mode` | no | `text`, `image`, `interpolate`, `references`, or `extend`; inferred when omitted |
| `references` | no | local PNG/JPEG/WebP paths, maximum 3 |
| `input_image` | no | local PNG/JPEG/WebP first-frame image path for `image` or `interpolate` |
| `end_image` | no | local PNG/JPEG/WebP last-frame image path for `interpolate` |
| `source_video` | no | local MP4/WebM source video path for `extend`; Gemini requires a previous Veo output with sidecar metadata |
| `out_path` | no | file path under `~/.rudi/outputs`; auto path if omitted |

`references` is intentionally generic at the MCP boundary. Provider adapters
map it to the provider's closest image-reference concept. For Gemini/Veo this
maps to `referenceImages`; first-frame and last-frame controls use
`input_image` and `end_image`. For fal Seedance 2.0, `references` maps to the
mode-specific reference-to-video `image_urls` input after the adapter uploads
local files through fal storage.

Gemini/Veo media-conditioned modes (`image`, `interpolate`, `references`, and
`extend`) currently require `duration_seconds: 8` in this stack. Prompt-only
text mode can use the model's listed durations. Gemini/Veo source-video
extension only works with a recent Veo-generated output that still has the
sidecar metadata written by this stack; arbitrary local MP4/WebM files are
rejected before the provider call.

Success response:

```json
{
  "ok": true,
  "out_path": "/Users/example/.rudi/outputs/video-20260517-120000-a1b2c3d4.mp4",
  "metadata_path": "/Users/example/.rudi/outputs/video-20260517-120000-a1b2c3d4.mp4.metadata.json",
  "provider": "gemini",
  "model": "veo-3.1-generate-preview",
  "job_id": "operations/abc123",
  "status": "completed",
  "asset_format": "story",
  "mode": "references",
  "aspect_ratio": "9:16",
  "duration_seconds": 8,
  "bytes": 1234567,
  "format": "mp4",
  "video_format": "mp4",
  "ms": 95000
}
```

Timeout response with resumable job details:

```json
{
  "ok": false,
  "error_kind": "timeout",
  "message": "Provider job did not complete within 420 seconds.",
  "provider": "gemini",
  "job_id": "operations/abc123",
  "status": "in_progress",
  "remediation": "Call get_video_job with this provider and job_id."
}
```

## `get_video_job`

Purpose: inspect a provider video job and optionally download a completed
result to `~/.rudi/outputs`.

Request:

```json
{
  "provider": "gemini",
  "job_id": "operations/abc123",
  "out_path": "/Users/example/.rudi/outputs/video.mp4"
}
```

Fields:

| Field | Required | Notes |
|---|---:|---|
| `provider` | yes | provider that owns the job |
| `job_id` | yes | provider job id returned by `generate_video` timeout or provider logs |
| `out_path` | no | file path under `~/.rudi/outputs`; used only when the job is complete |

Pending response:

```json
{
  "ok": true,
  "provider": "gemini",
  "job_id": "operations/abc123",
  "status": "in_progress",
  "completed": false
}
```

Completed response:

```json
{
  "ok": true,
  "provider": "gemini",
  "job_id": "operations/abc123",
  "status": "completed",
  "completed": true,
  "out_path": "/Users/example/.rudi/outputs/video.mp4",
  "metadata_path": "/Users/example/.rudi/outputs/video.mp4.metadata.json",
  "bytes": 1234567,
  "format": "mp4",
  "video_format": "mp4"
}
```
