# Video Editor Template Composer API Contract

Version: `0.1.0`

## Result Envelope

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
  "message": "Human-readable remediation.",
  "field": "template_id"
}
```

Allowed `error_kind` values:

- `validation`
- `unsupported_combo`
- `render_failed`
- `timeout`
- `write_failed`
- `unknown_tool`
- `internal_error`

## Tools

### `video_list_templates`

Returns static template metadata. It performs no rendering and makes no network calls.

Input fields:

- `status` optional, one of `draft`, `beta`, `current`, `deprecated`

### `video_render_template`

Validates a request and creates a local render job.

Required fields:

- `template_id`
- `data`

Optional fields:

- `format`, defaults to `story`
- `duration_seconds`, must match the selected template's `allowed_duration_seconds`
- `style`, must match the selected template's `supported_styles`
- `assets`, local image paths only; each template advertises accepted keys in `asset_schema`
- `audio_path`, local WAV, MP3, AAC, or M4A
- `out_path`, must be under `RUDI_VIDEO_EDITOR_OUTPUT_DIR` and end in `.mp4`; the default output root is `~/.rudi/outputs`

Existing output and metadata paths are rejected before rendering.

Supported formats:

- `story` - 1080x1920
- `landscape` - 1920x1080
- `square` - 1080x1080
- `portrait` - 1080x1350

Current templates:

- `stat-card-short` - 6, 10, or 15 seconds
- `playbook-story` - 30, 45, 60, or 90 seconds
- `quote-reel` - 10, 15, or 30 seconds
- `product-demo-sequence` - 30, 45, or 60 seconds
- `before-after-demo` - 10, 15, or 30 seconds

`product-demo-sequence` accepts optional assets:

- `logo`
- `hero_image`
- `screenshot_1`
- `screenshot_2`
- `screenshot_3`
- `screenshot_4`
- `screenshot_5`

`before-after-demo` accepts assets:

- `before_image`
- `after_image`
- `logo`

Supported styles:

- `editorial`
- `dashboard`
- `launch`
- `field-guide`
- `neon`
- `studio`

### `video_get_render_job`

Returns local job state.

Required fields:

- `job_id`

Statuses:

- `queued`
- `rendering`
- `completed`
- `failed`
- `canceled`
