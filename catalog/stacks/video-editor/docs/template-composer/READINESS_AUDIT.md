# Video Editor Template Composer Readiness Audit

## Current State

- One installable Node stack with video editing, transcription, and template rendering MCP tools.
- Four Remotion templates: `stat-card-short`, `playbook-story`, `quote-reel`, and `product-demo-sequence`.
- Four output formats: `story`, `landscape`, `square`, and `portrait`.
- Five style presets: `editorial`, `dashboard`, `launch`, `field-guide`, and `neon`.
- Template-scoped duration overrides are validated before render.
- Output is constrained to `RUDI_VIDEO_EDITOR_OUTPUT_DIR`, defaulting to `~/.rudi/outputs`.
- Job state is written to `~/.rudi/state/stacks/video-editor/template-composer/jobs`.
- Render output is validated with `ffprobe` before metadata is written.

## Not Yet Done

- Additional template families beyond stat cards and playbook explainers.
- Persistent restart recovery for in-flight renders.
- Frame extraction and nonblank visual smoke assertions.
- Agent automation workflows.
- Remotion commercial licensing confirmation before commercial use.

## Release Gates

- `npm run typecheck`
- `npm test`
- `npm run render:smoke`
- registry `npm run validate`
