# Video Editor Template Composer Debt Guardrails

- No Remotion code in `video-generator`.
- No AI provider SDK code in the `video-editor` template composer.
- No template metadata outside `src/template_registry.ts`.
- No templates without data schemas.
- No shell-string render commands.
- No remote asset fetches in v1.
- No output writes outside `RUDI_VIDEO_EDITOR_OUTPUT_DIR`, which defaults to `~/.rudi/outputs`.
- No overwriting existing output or metadata files.
- No generated videos, render caches, or temp files committed.

## Accepted Debt

| Date | Area | Accepted debt | Next action |
|---|---|---|---|
| 2026-05-17 | Job lifecycle | In-flight jobs are not resumed after server restart. | Add process recovery before using this for long-running unattended batches. |
| 2026-05-17 | Templates | Only `stat-card-short` exists. | Add templates after the first contract is stable. |
