# Video Generator Debt Guardrails

This document is the debt-control checklist for future work on
`video-generator`.

## Non-Negotiable Separation Rules

- [x] No video code goes inside `image-generator`.
- [x] No image generation behavior goes inside `video-generator`.
- [x] `src/server.py` remains MCP boundary only.
- [x] `src/tools.py` remains orchestration only.
- [x] Provider SDK details remain in `src/renderer/*_client.py`.
- [x] Model defaults and provider status labels remain in `src/model_config.py`.
- [x] Provider/model response building remains in `src/model_registry.py`.
- [x] Output path, sidecar metadata, and MP4/WebM validation remain in
  `src/outputs.py`.
- [x] Async job polling remains in `src/jobs.py`.

## Duplication Checks Before Every Change

Run these from the stack directory:

```bash
rg -n "generate_video|list_video_models|get_video_job|VideoJob|safe_write_video|detect_video_format|write_output_metadata" src tests
find . -name "__pycache__" -o -name "*.pyc"
```

Review checklist:

- [x] There is one public `generate_video` orchestration function.
- [x] There is one public `get_video_job` orchestration function.
- [x] There is one model catalog source: `src/model_config.py`.
- [x] There is one output policy source: `src/outputs.py`.
- [x] There is one provider registry: `src/renderer/providers.py`.
- [x] Any repeated validation logic has been moved to `src/validation.py`.
- [x] Any repeated polling logic has been moved to `src/jobs.py`.

## Provider Adapter Rules

Provider clients may:

- Call provider SDKs or provider HTTP APIs.
- Translate normalized fields into provider-specific request shapes.
- Convert provider job/status objects into `VideoJob`.
- Download provider output bytes.

Provider clients must not:

- Decide stack-wide defaults.
- Write files to disk.
- Return public MCP envelopes.
- Poll loops internally.
- Read RUDI secrets directly.
- Import `tools.py` or `server.py`.

## Schema/API Drift Checks

Whenever `API_CONTRACT.md` changes:

- [x] Update `src/server.py` schemas.
- [x] Update `src/validation.py`.
- [x] Update `src/model_registry.py` if model capability rules change.
- [x] Update `tests/test_mcp_stdio.py`.
- [x] Update `tests/test_tools.py`.
- [x] Update `README.md` examples if user-facing fields changed.

Whenever `src/server.py` changes:

- [x] Confirm `additionalProperties: false` remains on every tool schema.
- [x] Confirm no provider SDK imports were added.
- [x] Confirm safe exception redaction still includes all provider secret names.

## Accumulated Change Review

Before merging a larger iteration:

- [x] List files touched.
- [x] Confirm each touched file has one responsibility.
- [x] Confirm no old alternate implementation remains beside a new one.
- [x] Confirm docs describe the current implementation, not intended future work.
- [x] Confirm tests cover the current public contract.
- [x] Confirm live-test notes are in `READINESS_AUDIT.md` if credentials were used.
- [x] Confirm no generated outputs, videos, caches, secrets, or local env files are
  staged.

## Default Verification Commands

From `catalog/stacks/video-generator`:

```bash
python -m compileall -q src tests
python -m unittest discover -s tests -v
```

From `apps/registry`:

```bash
npm run validate
```

If JS/TS files are edited in the registry package, also run the repo's agent
debt scan workflow for the edited files.

## Debt Acceptance Log

Use this section only when a warning is intentionally left in place.

| Date | Area | Accepted debt | Owner/next action |
|---|---|---|---|
| 2026-05-17 | Provider support | Replicate adapters are beta/model-specific until live tested. | Promote one model at a time after live smoke tests. |
| 2026-05-17 | Provider support | OpenAI Sora is optional preview, not default. | Re-check official OpenAI docs before production use. |
| 2026-05-18 | Provider support | fal Seedance 2.0 standard remains exposed but not live-smoked; Seedance 2.0 Fast is live-proven across all exposed modes. | Live-smoke standard only if it adds useful quality or reliability over Fast. |
