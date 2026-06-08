# Video Generator Live Smoke Tests

Default unit tests must not call paid provider APIs. Live smoke tests are
manual, explicit, and guarded.

## Safety Rules

- Use `--confirm-cost` for any command that can call a provider.
- Run one provider/model at a time while stabilizing adapters.
- Write outputs under `~/.rudi/outputs`.
- Keep generated videos out of git.
- Update `READINESS_AUDIT.md` with provider/model results.

## Commands

From the stack directory:

```bash
cd <registry-root>/catalog/stacks/video-generator
python tests/live_provider_smoke.py --provider gemini --confirm-cost
```

Run all configured providers:

```bash
python tests/live_provider_smoke.py --all-configured --confirm-cost
```

OpenAI/Sora is legacy optional. Prefer Gemini first, then one Replicate or fal
model at a time; only run OpenAI smoke tests when intentionally checking legacy
compatibility.

Use a reference image:

```bash
python tests/live_provider_smoke.py \
  --provider gemini \
  --mode references \
  --duration 8 \
  --reference <rudi-home>/outputs/frame.png \
  --confirm-cost
```

Use first-frame image-to-video:

```bash
python tests/live_provider_smoke.py \
  --provider gemini \
  --mode image \
  --duration 8 \
  --input-image <rudi-home>/outputs/frame.png \
  --confirm-cost
```

Use first/last-frame interpolation:

```bash
python tests/live_provider_smoke.py \
  --provider gemini \
  --mode interpolate \
  --duration 8 \
  --input-image <rudi-home>/outputs/first.png \
  --end-image <rudi-home>/outputs/last.png \
  --confirm-cost
```

Use source-video extension:

```bash
# First generate a Gemini/Veo source video with this stack so the output has
# its .metadata.json sidecar.
python tests/live_provider_smoke.py \
  --provider gemini \
  --mode extend \
  --duration 8 \
  --source-video <rudi-home>/outputs/source.mp4 \
  --confirm-cost
```

Gemini/Veo extension accepts recent Veo-generated source videos only. The
source MP4/WebM must keep the `.metadata.json` sidecar written by this stack.

Use a specific model:

```bash
python tests/live_provider_smoke.py \
  --provider replicate \
  --model seedance-fast \
  --duration 5 \
  --confirm-cost
```

Replicate Seedance image-to-video:

```bash
python tests/live_provider_smoke.py \
  --provider replicate \
  --model seedance-fast \
  --mode image \
  --format story \
  --duration 5 \
  --input-image <rudi-home>/outputs/vertical-frame.png \
  --confirm-cost
```

Replicate Kling image-to-video:

```bash
python tests/live_provider_smoke.py \
  --provider replicate \
  --model kling \
  --mode image \
  --format story \
  --duration 5 \
  --input-image <rudi-home>/outputs/vertical-frame.png \
  --confirm-cost
```

Replicate MiniMax landscape text-to-video:

```bash
python tests/live_provider_smoke.py \
  --provider replicate \
  --model minimax \
  --mode text \
  --format landscape \
  --duration 6 \
  --confirm-cost
```

For Replicate image-to-video models, use a source image with the desired aspect
ratio. Several hosted models follow the source image shape rather than the
requested `format`; mismatched source images are rejected before provider
dispatch.

fal Seedance 2.0 Fast text-to-video:

```bash
python tests/live_provider_smoke.py \
  --provider fal \
  --model seedance-2-fast \
  --mode text \
  --format story \
  --duration 5 \
  --confirm-cost
```

fal Seedance 2.0 Fast image-to-video:

```bash
python tests/live_provider_smoke.py \
  --provider fal \
  --model seedance-2-fast \
  --mode image \
  --format story \
  --duration 5 \
  --input-image <rudi-home>/outputs/vertical-frame.png \
  --confirm-cost
```

fal Seedance 2.0 Fast first/last-frame interpolation:

```bash
python tests/live_provider_smoke.py \
  --provider fal \
  --model seedance-2-fast \
  --mode interpolate \
  --format story \
  --duration 5 \
  --input-image <rudi-home>/outputs/first.png \
  --end-image <rudi-home>/outputs/last.png \
  --confirm-cost
```

fal Seedance 2.0 Fast reference-to-video:

```bash
python tests/live_provider_smoke.py \
  --provider fal \
  --model seedance-2-fast \
  --mode references \
  --format story \
  --duration 5 \
  --reference <rudi-home>/outputs/frame.png \
  --confirm-cost
```

## Expected Results

Pass:

- Command exits `0`.
- JSON result has `ok: true`.
- `out_path` is under `~/.rudi/outputs`.
- `video_format` is `mp4` or `webm`.
- `bytes` is greater than zero.

Skip:

- Provider secret is missing.
- Provider/model requires a reference and none was supplied.

Fail:

- Provider returns an unstructured error.
- Output bytes fail MP4/WebM validation.
- Output path escapes `~/.rudi/outputs`.
- Any secret appears in output.
