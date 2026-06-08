## Phase 0: Baseline And Manual Lookup

- Scope: make registry skills participate as first-class package metadata in validation/compile flows, and enforce stack/skill relationship integrity.
- Files to inspect before editing: `src/compile.ts`, `src/validate.ts`, `src/resolver.ts`, `src/schema.test.ts`, `src/compile.test.ts`, `src/resolver.test.ts`, `src/public-readiness.ts`, `schemas/package.schema.json`, `SCHEMA.md`, `README.md`, `STACK_RELATED_SKILLS_CHECKLIST.md`, `index.json`, `catalog/skills/*.md`, `catalog/stacks/*/manifest.v2.json`.
- Relevant SWE manual sections: Build Order Phase 1 schema foundation; Build Order Phase 5 agent workflows; Engineering Doctrine boundary validation; Testing Doctrine Appendix C and red-green-refactor; Backend standard G12-style schema validation discipline.
- Current-state commands: `git status -sb`; `npm test`; `npm run validate:v2`; `npm run validate:public`.
- Risks and invariants: preserve user/unrelated dirty worktree changes; do not change install semantics for stacks/binaries/runtimes; do not add dependencies unless required; skills must remain editable Markdown; stack `provides.tools` must not be confused with `related.skills`.
- Exit criteria: baseline captured, relevant doctrine consulted, scope agreed by implementation boundaries.

## Phase 1: Scope Lock

- In scope: parse skill Markdown frontmatter into v2 `Package` objects; include skills in compiler output; validate skills through package schema/policy; enforce `related.skills` IDs resolve to registry skills; enforce skill `requires.stacks` IDs resolve to registry stacks; update docs and checklist.
- Non-goals: changing CLI installer behavior; adding automatic related-skill installation; refactoring unrelated stack manifests.
- Expected files touched: `src/compile.ts`, `src/validate.ts`, `src/resolver.ts` only if types require it, relevant test files, `SCHEMA.md`, `README.md`, `STACK_RELATED_SKILLS_CHECKLIST.md`, this plan file.
- External inputs and trust boundaries: Markdown frontmatter from `catalog/skills/*.md`; JSON v2 manifests from `catalog/**`; hand-maintained `index.json`.
- Failure behavior to define: malformed or missing skill frontmatter fails validation/compile with file context; unknown related skill or required stack fails validation/compile with package id context.
- Exit criteria: implementation boundary locked and no unrelated changes planned.

## Phase 2: Red Tests

- Observable behavior to prove: compiler includes Markdown skills as `kind:"skill"` packages; validator rejects malformed skill packages; integrity checker rejects missing `related.skills`; integrity checker rejects skill `requires.stacks` references that are not known stacks.
- Test files to add or edit: `src/compile.test.ts`, `src/schema.test.ts` or `src/resolver.test.ts`, and a focused unit/integration test file if needed.
- Red command: run targeted Vitest command for the changed behavior before implementation.
- Expected failure: tests fail because the current compiler/validator only discovers JSON v2 manifests and does not enforce referential integrity.
- Exit criteria: at least one focused red failure observed before implementation.

## Phase 3: Implementation

- Implementation rules: smallest code path that preserves existing v2 JSON behavior; derive skill id from filename unless frontmatter provides a compatible id; normalize `requires.stacks` to `stack:*`; reject unsupported frontmatter shapes instead of silently accepting them.
- Files allowed to change: locked scope files only.
- Validation and error-handling requirements: schema validation through existing AJV package schema; semantic validation for relationship references; explicit parse errors with file paths.
- Observability requirements: CLI validation/compile output must identify failing file/package; no runtime telemetry needed for this package-local validator.
- Exit criteria: targeted tests move from red to green without weakening assertions.

## Phase 4: Green Tests And Refactor

- Green command: rerun the red command unchanged.
- Refactor constraints: only remove duplication or clarify parsing/integrity code after green; preserve generated index shape.
- Regression checks: run all affected registry tests after any refactor.
- Exit criteria: targeted suite remains green after cleanup.

## Phase 5: Full Verification

- Targeted tests: focused tests for skill package discovery and relationship integrity.
- Full suite: `npm test`.
- Build/typecheck/lint: `npm run validate:v2`; `npm run compile`; `npx tsc --noEmit` if practical.
- JS/TS debt scan, if applicable: run repo-local runner if present, otherwise fallback structural scan for edited TS files.
- Live smoke checks: not applicable; this is a package compiler/validator change with no server/UI.
- Exit criteria: all feasible checks pass; public-readiness failures are resolved or explicitly recorded as accepted debt.

## Phase 6: Docs, Contracts, And Closure

- Docs or API contracts to update: `README.md`, `SCHEMA.md`, `STACK_RELATED_SKILLS_CHECKLIST.md`.
- Final files touched: record at closure.
- Commands run and results: record red command, green command, full suite, validation, compile, debt scan.
- Accepted debt: public-readiness checksum placeholders and unrelated untracked indexed paths if still present.
- Definition of Done: skills are first-class validated packages, relationship integrity is enforced, docs match behavior, verification commands are reported.

## Execution Notes

- Red command: `npx vitest run src/catalog.test.ts src/schema.test.ts`
- Red result: failed as expected because `src/catalog.ts` did not exist and schema rejected `requires.stacks`.
- Green command: `npx vitest run src/catalog.test.ts src/schema.test.ts`
- Green result: 28 tests passed.
- Targeted regression command: `npx vitest run src/catalog.test.ts src/schema.test.ts src/compile.test.ts`
- Targeted regression result: 46 tests passed.
- Full suite: `npm test`
- Full suite result: 98 tests passed.
- Build: `npm run build`
- Build result: `validate:v2` passed for 83 catalog package files; compile emitted 83 packages with 20 skills and 30 stacks.
- Typecheck attempt: `npx tsc --noEmit`
- Typecheck result: failed on existing project TypeScript setup debt, mainly missing Node type declarations and existing resolver/test typing issues. The new circular type alias caught during the first attempt was fixed.
- Public readiness: `npm run validate:public`
- Public readiness result: passes with 0 errors and 0 warnings after tracking advertised package paths, resolving checksum placeholders, and retiring the legacy prompt catalog.
- Legacy index drift: root `index.json` currently lists 19 skills; generated `dist/index.json` lists 21 skills. This change makes the generated v2 indexes source-derived, but does not replace or regenerate the legacy root index.
- Debt scan: `node "$DEV_HELP_ROOT/agent-debt-scan.js" --repo "$REGISTRY_ROOT" --entrypoint src/compile.ts --entrypoint src/validate.ts --entrypoint src/public-readiness.ts --files src/catalog.ts,src/compile.ts,src/validate.ts,src/resolver.ts,src/public-readiness.ts --json`
- Debt scan result: 0 findings.
