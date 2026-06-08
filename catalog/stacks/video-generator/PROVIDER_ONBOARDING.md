# Video Provider Onboarding

This is the process for adding or promoting video providers and models in
`video-generator`.

The goal is to get providers working without accumulating compatibility
fallbacks, duplicate config, or provider-specific fields in the public MCP API.

## Provider Rollout Stages

| Stage | Meaning | Release posture |
|---|---|---|
| `candidate` | Added to docs or backlog only; no adapter yet | Not exposed |
| `beta` / `beta_hosted` | Adapter exists, but model schema is provider/model-specific or not fully live-tested | Exposed, not default |
| `preview` | First-party provider marks the API or model as preview | Exposed, not default |
| `legacy` / `legacy_deprecated` | Provider catalog marks the API or model as legacy or deprecated | Explicit experiments only |
| `primary` | Default provider family for this stack | Exposed and default-capable |
| `current` | Specific model has passed live smoke and failure-path tests | Can be recommended |

## Single Source Files

Provider configuration lives in exactly these places:

- Provider rollout metadata: `src/model_config.py` -> `PROVIDER_CONFIGS`
- Default model per provider: `src/model_config.py` -> `DEFAULT_MODEL_BY_PROVIDER`
- Model aliases: `src/model_config.py` -> `MODEL_ALIASES`
- Model capability catalog: `src/model_config.py` -> `KNOWN_MODELS`
- Input mode capability catalog: `src/model_config.py` -> each model's `modes`
- Secret name per provider: `src/constants.py` -> `SECRET_ENV_BY_PROVIDER`
- Provider selection: `src/renderer/providers.py`
- Provider SDK adapter: `src/renderer/<provider>_client.py`

Do not duplicate provider defaults in `tools.py`, `server.py`, README examples,
or tests.

## Adding a New Provider

1. Add exactly one secret name in `src/constants.py`.
2. Add provider rollout metadata in `PROVIDER_CONFIGS`.
3. Add a default model in `DEFAULT_MODEL_BY_PROVIDER`.
4. Add aliases in `MODEL_ALIASES`.
5. Add one or more models in `KNOWN_MODELS`.
6. Add the provider name to `src/renderer/providers.py`.
7. Add one adapter file under `src/renderer/`.
8. Add unit tests with fake provider responses.
9. Add a live smoke entry to `tests/live_provider_smoke.py` if the provider can
   run from the normalized contract.
10. Update `API_CONTRACT.md`, `README.md`, and `READINESS_AUDIT.md`.

Exit criteria:

- [x] `list_video_models` shows provider metadata, default model, aliases,
  model capabilities, and secret status.
- [x] Invalid provider/model/reference/duration combos fail before provider
  dispatch.
- [x] Invalid mode/media combos fail before provider dispatch.
- [x] One live text-to-video generation succeeds.
- [x] One live image-to-video generation succeeds if references are supported.
- [x] Completed output validates as MP4 or WebM.
- [x] Provider failure returns a redacted structured error.

## Adding a New Model to an Existing Provider

1. Add the model to `KNOWN_MODELS`.
2. Add an alias only if it improves usability and does not hide meaningful
   provider differences.
3. Add or update provider adapter mapping only if the model schema differs.
4. Add a unit test for validation rules.
5. Run a live smoke test before marking the model `current`.

Model metadata must include:

- `label`
- `status`
- `default`
- `formats`
- `durations`
- `default_duration_seconds`
- `references`
- `notes`

## Current Provider Plan

### Gemini/Veo

Start here.

- Secret: `GEMINI_API_KEY`
- Default: `veo-3.1-generate-preview`
- Why first: first-party provider API with documented long-running operations.
- Immediate tests:
  - [x] Text-to-video, story, 4 seconds
  - [x] Text-to-video, landscape, 4 seconds
  - [x] First-frame image-to-video, story, 8 seconds
  - [x] Reference image, story, 8 seconds
  - [x] First/last-frame interpolation, story, 8 seconds
  - [x] Source-video extension from a prior Veo output with metadata sidecar
  - [x] Invalid duration with media-conditioned Gemini modes returns
    `unsupported_combo`

### Replicate

Use one model at a time. Treat each model as a separate adapter contract.

Candidates:

- `bytedance/seedance-1-pro-fast`
- `bytedance/seedance-1-pro`
- `minimax/video-01`
- `kwaivgi/kling-v2.1`

Immediate tests:

- [x] Text-to-video for Seedance Fast.
- [x] Text-to-video for Seedance Pro.
- [x] Image-to-video for Seedance Fast using one vertical local image.
- [x] Image-to-video for Kling v2.1 using one vertical local image.
- [x] Text-to-video for MiniMax Video-01 as landscape.
- [x] Output URL download and MP4/WebM validation.
- [x] Add mode-specific format validation if source-image aspect ratio must be
  enforced before provider dispatch.

Promotion rule: do not mark a Replicate model `current` until its exact model
schema has been live-tested through this stack.

### fal

Treat fal as a hosted model platform. Add each model family with explicit
mode-to-endpoint mappings instead of a generic fallback endpoint.

- Secret: `FAL_KEY`
- Default inside provider: `bytedance/seedance-2.0/fast`
- Rollout stage: `beta`
- Why next: fal exposes current Seedance 2.0 endpoints with queue semantics
  that match this stack's job abstraction.

Immediate tests:

- [x] Catalog exposes Seedance 2.0 Fast and Seedance 2.0 standard endpoint
  families.
- [x] Adapter maps `text`, `image`, `interpolate`, and `references` to explicit
  fal endpoint ids.
- [x] Unit tests cover fal payload fields without importing the provider SDK.
- [x] Text-to-video smoke reaches fal with `FAL_KEY`.
- [x] Text-to-video generation completes and writes a valid MP4.
- [x] Image-to-video smoke with one local first-frame image.
- [x] First/last-frame interpolation smoke.
- [x] Reference-to-video smoke with one local image reference.

Promotion rule: keep fal models `beta_hosted` until the live smokes above pass
and output bytes validate as MP4/WebM through this stack.

### OpenAI/Sora

Keep optional.

- Secret: `OPENAI_API_KEY`
- Default inside provider: `sora-2`
- Rollout stage: `legacy`
- Why optional: official Videos API docs exist, but the current OpenAI model
  catalog marks Sora 2 models as deprecated/legacy.

Immediate tests:

- Create job with `sora-2`.
- Poll job with `get_video_job`.
- Download completed MP4.
- Verify reference-image flow if enabled for the account/model.

## Working Definition

A provider/model is "working" only when all of these pass:

Current checked live-provider items apply to Gemini/Veo as of 2026-05-17,
including text, landscape, image, references, interpolation, and extension.
Replicate is live-proven for Seedance Fast text/image, Seedance Pro text, Kling
v2.1 image, and MiniMax Video-01 landscape text. fal is live-proven for
Seedance 2.0 Fast text-to-video, image-to-video, first/last-frame
interpolation, and reference-to-video. OpenAI is not yet live-proven through
this stack.

- [x] `list_video_models` describes it accurately.
- [x] Missing secret produces `missing_secret`.
- [x] Bad input is rejected before provider dispatch.
- [x] Job submission returns a provider job id.
- [x] Polling reaches completed or a structured provider failure.
- [x] Downloaded bytes validate as MP4 or WebM.
- [x] Output is written only under `~/.rudi/outputs`.
- [x] A repeat call cannot overwrite an existing output.
- [x] No secret values appear in returned errors.
