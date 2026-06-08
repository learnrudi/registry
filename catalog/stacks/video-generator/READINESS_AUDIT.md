# Video Generator Readiness Audit

Version: `0.1.0`

## Status

Contract-first MCP stack with isolated provider clients. Gemini/Veo is
live-proven for text, portrait, landscape, first-frame image, references,
first/last-frame interpolation, and source-video extension from a previous Veo
output. Replicate is live-proven across the listed beta hosted models. fal is
cataloged and adapter-wired for Seedance 2.0, and Seedance 2.0 Fast
text-to-video, image-to-video, first/last-frame interpolation, and
reference-to-video are live-proven.

## Boundary Checks

- `src/server.py` contains MCP schemas, dispatch, and redacted exception
  handling only.
- `src/tools.py` contains public orchestration only.
- Provider SDK details live under `src/renderer/`.
- Model defaults and current/beta/preview/legacy labels live in
  `src/model_config.py`.
- Job polling lives in `src/jobs.py`.
- Output path policy and MP4/WebM validation live in `src/outputs.py`.
- Output provenance metadata is written as `.metadata.json` sidecars and is
  required for Gemini/Veo source-video extension.
- No video generation code was added to `image-generator`.
- `GEMINI_API_KEY` is the only Gemini secret for this stack; no compatibility
  fallback is currently supported.
- `FAL_KEY` is the only fal secret for this stack; no compatibility fallback is
  currently supported.
- Provider rollout metadata lives in `src/model_config.py`.
- Live provider checks are guarded behind `tests/live_provider_smoke.py
  --confirm-cost`.

## Provider Review

Gemini/Veo is the first-class default. The Gemini API exposes Veo through a
long-running operation flow and supports portrait, landscape, first-frame
image-to-video, reference images, first/last-frame interpolation, and extension
of prior Veo-generated videos. Gemini extension is not an arbitrary local video
upload path; it requires the prior provider video URI preserved in the stack's
output metadata sidecar.

Replicate is included as beta because its video surface is model-specific.
Adapters are intentionally narrow and should be expanded one model at a time.
Seedance, Kling, and MiniMax have now been live-smoked through Replicate, but
remain beta-hosted because each model exposes a different schema and some modes
derive aspect ratio from the source image rather than a request field. The
stack now validates source-image aspect ratio before dispatch for those models.

fal is included as beta because it is a hosted model platform with
mode-specific endpoint ids. The adapter maps normalized RUDI modes to fal
Seedance 2.0 text-to-video, image-to-video, and reference-to-video endpoints.
The adapter has unit coverage. Live text-to-video, image-to-video,
interpolation, and reference smokes completed with validated MP4 outputs after
fal billing was topped up.

OpenAI is included only as a legacy optional adapter. The Videos API docs still
exist and expose Sora 2 models, but the current OpenAI model catalog marks those
models as deprecated/legacy. It should not be treated as the stack default.

## Live Test Results

### Gemini/Veo Input Modes

- Date: 2026-05-17
- Provider: `gemini`
- Model: `veo-3.1-generate-preview`
- Secret source: RUDI `GEMINI_API_KEY`, injected only into the smoke-test child
  process.

| Mode | Format | Requested duration | Job id | Output | Bytes | Local verification |
|---|---|---:|---|---|---:|---|
| `text` | `story` | 4s | `models/veo-3.1-generate-preview/operations/hd1l9vat2xks` | `<rudi-home>/outputs/video-smoke-gemini-default-4de49a4f.mp4` | 827,079 | MP4, H.264, AAC, 720x1280, 4.0s |
| `text` | `landscape` | 4s | `models/veo-3.1-generate-preview/operations/r1kvr758tkj7` | `<rudi-home>/outputs/video-smoke-gemini-default-410b8d1e.mp4` | 2,729,656 | MP4, H.264, AAC, 1280x720, 4.0s |
| `image` | `story` | 8s | `models/veo-3.1-generate-preview/operations/uoinrc6lq1du` | `<rudi-home>/outputs/video-smoke-gemini-default-385dde68.mp4` | 6,003,820 | MP4, H.264, AAC, 720x1280, 8.0s |
| `references` | `story` | 8s | `models/veo-3.1-generate-preview/operations/ks62vxtccd0f` | `<rudi-home>/outputs/video-smoke-gemini-default-9ea85881.mp4` | 13,368,353 | MP4, H.264, AAC, 720x1280, 8.0s |
| `interpolate` | `story` | 8s | `models/veo-3.1-generate-preview/operations/nxgtygqdyslo` | `<rudi-home>/outputs/video-smoke-gemini-default-6cdc6da8.mp4` | 1,405,590 | MP4, H.264, AAC, 720x1280, 8.0s |
| `extend` source | `story` | 4s | `models/veo-3.1-generate-preview/operations/uutsd6rte4xg` | `<rudi-home>/outputs/video-smoke-gemini-default-7424f5ef.mp4` | 541,971 | MP4, H.264, AAC, 720x1280, 4.0s; metadata has Gemini URI |
| `extend` | `story` | 8s | `models/veo-3.1-generate-preview/operations/idhcl9c51omu` | `<rudi-home>/outputs/video-smoke-gemini-default-2d4b3f0f.mp4` | 1,820,221 | MP4, H.264, AAC, 720x1280, 11.011s; metadata has Gemini URI |

Source-video extension initially failed when the adapter sent local video bytes
with a MIME type, because the SDK serialized that MIME type as `encoding` and
Gemini rejected it. The fixed adapter sends only the previous Veo video URI
stored in the sidecar metadata.

### Replicate Hosted Models

- Date: 2026-05-17
- Provider: `replicate`
- Secret source: RUDI `REPLICATE_API_TOKEN`, injected only into the smoke-test
  child process.

| Model | Mode | Format | Requested duration | Job id | Output | Bytes | Local verification |
|---|---|---|---:|---|---|---:|---|
| `bytedance/seedance-1-pro-fast` | `text` | `story` | 5s | `hg2hx4t14srmr0cy70nrrztj8g` | `<rudi-home>/outputs/video-smoke-replicate-seedance-fast-1121d9d8.mp4` | 4,102,331 | MP4, H.264, 1088x1920, 5.041667s |
| `bytedance/seedance-1-pro-fast` | `image` | `story` | 5s | `n32kv8hz3xrmt0cy70qb1gj8xg` | `<rudi-home>/outputs/video-smoke-replicate-seedance-fast-1b0ffbbc.mp4` | 5,375,402 | MP4, H.264, 1088x1920, 5.041667s |
| `bytedance/seedance-1-pro` | `text` | `story` | 5s | `pemrzygyt9rmw0cy70qskk2n64` | `<rudi-home>/outputs/video-smoke-replicate-seedance-0e7c5753.mp4` | 6,521,147 | MP4, H.264, 1088x1920, 5.041667s |
| `kwaivgi/kling-v2.1` | `image` | `story` | 5s | `pcgv53sv7hrmw0cy70rt6c4pc4` | `<rudi-home>/outputs/video-smoke-replicate-kling-56f98a15.mp4` | 1,707,490 | MP4, H.264, 720x1280, 5.041667s |
| `minimax/video-01` | `text` | `landscape` | 6s | `dkjw8egfg1rmt0cy70vs8k1gtm` | `<rudi-home>/outputs/video-smoke-replicate-minimax-129e3f6f.mp4` | 345,306 | MP4, H.264, 1280x720, 5.64s |

Important finding: Seedance image-to-video and Kling follow the input image
shape. A square source image produced a square Seedance output even when the
request used `format: story`; the successful `story` image smokes used a
vertical source image. MiniMax Video-01 text-to-video returned landscape output
and is therefore exposed as landscape-only in the catalog. The square-image
Seedance case is now rejected before provider dispatch.

### fal Hosted Models

- Date: 2026-05-18
- Provider: `fal`
- Secret source: `FAL_KEY`

| Model | Mode | Format | Requested duration | Status |
|---|---|---|---:|---|
| `bytedance/seedance-2.0/fast` | `text` | `story` | 5s | Passed; job `bytedance/seedance-2.0/fast/text-to-video\|019e38f1-31eb-7052-b420-3b4bcfb891a1`, output `<rudi-home>/outputs/video-smoke-fal-seedance-2-fast-bfe8cfdd.mp4`, 1,358,329 bytes |
| `bytedance/seedance-2.0/fast` | `image` | `story` | 5s | Passed; job `bytedance/seedance-2.0/fast/image-to-video\|019e38f9-7e74-7001-9135-d8c711df27e4`, output `<rudi-home>/outputs/video-smoke-fal-seedance-2-fast-c8765fdc.mp4`, 596,297 bytes |
| `bytedance/seedance-2.0/fast` | `interpolate` | `story` | 5s | Passed; job `bytedance/seedance-2.0/fast/image-to-video\|019e38ff-f40e-7861-a9a1-6a33cd1e06da`, output `<rudi-home>/outputs/video-smoke-fal-seedance-2-fast-e8617eec.mp4`, 979,036 bytes |
| `bytedance/seedance-2.0/fast` | `references` | `story` | 5s | Passed; job `bytedance/seedance-2.0/fast/reference-to-video\|019e3902-41b2-7c13-94c8-c41e836e4d8a`, output `<rudi-home>/outputs/video-smoke-fal-seedance-2-fast-4b322a10.mp4`, 647,051 bytes |

Initial text smoke failed while the fal account was locked for exhausted
balance. After topping up billing, the same text smoke completed through the
stack. Local verification: MP4, H.264, 720x1280, 5.06195s container duration.
The image smoke used `<rudi-home>/outputs/video-composer-style-previews/editorial-stat.png`
as a `1080x1920` first frame. Local verification: MP4, H.264, 720x1280,
5.06195s container duration. The interpolation smoke used the same first frame
and `<rudi-home>/outputs/fal-seedance-interpolate-end-1080x1920.png` as
the last frame; local verification: MP4, H.264, 720x1280, 5.06195s container
duration. The reference smoke used the editorial card as `@Image1`; local
verification: MP4, H.264, 720x1280, 5.06195s container duration.

## Remaining Work

- Decide whether to promote Seedance Fast as the Replicate default production
  beta after reviewing output quality, latency, and cost.
- Optionally live-smoke fal Seedance 2.0 standard after reviewing cost and
  whether it adds useful quality over Seedance 2.0 Fast.
- Add registry release compilation when this stack is included in a release
  build.
- Publish or compile registry release artifacts before expecting
  `rudi search video-generator` / `rudi install video-generator` to work from
  the installed CLI registry.
