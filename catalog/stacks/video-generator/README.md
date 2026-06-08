# Video Generator

Agent-safe multi-provider video generation for RUDI content workflows.

This stack is intentionally separate from `image-generator`. It owns video
model metadata, video provider clients, job polling, and MP4/WebM output
validation under `catalog/stacks/video-generator/`.

## Tools

- `list_video_models` - returns provider/model capabilities and secret status
- `generate_video` - generates one video and writes it under `~/.rudi/outputs`
- `get_video_job` - checks a provider job and downloads the completed result

## Providers

Gemini/Veo is the default provider. Replicate and fal hosted video models are
treated as beta and model-specific. OpenAI Sora is retained only as a legacy
optional adapter because the OpenAI model catalog currently marks Sora 2 models
as deprecated/legacy.

Replicate adapters are intentionally narrow. Seedance supports text and
image-to-video; Kling v2.1 is image-to-video only; MiniMax Video-01 is exposed
as landscape text-to-video. For Replicate models that follow source image
shape, the stack rejects image-to-video inputs whose dimensions do not match the
requested `format`.

fal is exposed through explicit Seedance 2.0 endpoint mappings. Text,
first-frame image-to-video, first/last-frame interpolation, and image
references are supported in the catalog, but remain beta until live-smoked with
`FAL_KEY`.

## Example

Text-to-video:

```json
{
  "provider": "gemini",
  "prompt": "Short vertical product reveal video.",
  "model": "default",
  "format": "story",
  "duration_seconds": 4,
  "out_path": "/Users/example/.rudi/outputs/video.mp4"
}
```

Reference-guided video:

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

Supported normalized input modes are `text`, `image`, `interpolate`,
`references`, and `extend`. Use `input_image` for first-frame image-to-video,
`input_image` plus `end_image` for first/last-frame interpolation, `references`
for style/subject/composition guidance, and `source_video` for extension.
Gemini/Veo extension requires a recent Veo-generated output from this stack
with its `.metadata.json` sidecar; arbitrary local videos are not valid Gemini
extension sources.

## Secrets

Set at least one provider secret before generation:

- `GEMINI_API_KEY` for Gemini/Veo
- `REPLICATE_API_TOKEN` for Replicate hosted models
- `FAL_KEY` for fal hosted models
- `OPENAI_API_KEY` for OpenAI Sora

`list_video_models` checks whether secrets are present without making provider
API calls.

## Output Policy

All generated files must be written under `~/.rudi/outputs`. Existing files are
not overwritten. The stack validates returned video bytes before writing and
accepts MP4 or WebM output. Each written video also gets a `.metadata.json`
sidecar used for provider provenance and Gemini/Veo source-video extension.

## Contract

See `API_CONTRACT.md` for the stable tool contract, envelopes, validation
rules, and provider capability model.

## Development

- `DEVELOPMENT_WORKFLOW.md` defines the phased build process.
- `PROVIDER_ONBOARDING.md` defines how providers and models are added.
- `LIVE_SMOKE_TESTS.md` defines explicit paid-provider smoke tests.
- `DEBT_GUARDRAILS.md` defines drift and duplication checks.
