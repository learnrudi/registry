# RUDI Registry

Source of truth for stacks, runtimes, binaries, agents, and skills consumed by
the RUDI CLI.

## Canonical Layout

```text
index.json                         # Generated schema-v2 package index
catalog/
├── stacks/{id}/manifest.json      # Stack metadata and secret declarations
├── runtimes/{id}.json             # Runtime definitions
├── binaries/{id}.json             # Binary definitions
├── agents/{id}.json               # Agent definitions
└── skills/{id}/SKILL.md
```

Canonical paths are unversioned. Do not create `index.v2.json`,
`manifest.v2.json`, or catalog `/v2/` directories. Schema evolution is expressed
by each document's `schemaVersion`/shape, not parallel filenames.

## Inventory

Never maintain a hardcoded stack list. Discover the current public inventory:

```bash
node -e "const i=require('./index.json'); console.log(Object.keys(i.packages).join('\\n'))"
npm run validate
```

Public catalog source must remain generic and portable. Personal workflows,
absolute local paths, account state, run artifacts, downloaded media, and
brand-specific defaults belong in local `.rudi` state or private/local skills.

## Adding a Package

1. Add or update the one canonical catalog source.
2. Add focused behavior tests where applicable.
3. Run `npm run indexes:sync`; never hand-edit `index.json`.
4. Run the required verification gates.

For stacks, create `catalog/stacks/{id}/manifest.json` and add the implementation
under the package directory. Use schema-v2 package IDs such as `stack:slack` and
dependency IDs such as `binary:ffmpeg`.

## Required Verification

```bash
npm test
npm run validate
npm run indexes:sync
npm run indexes:check
npm run catalog:clean:check
npm run build
npm pack --dry-run --json
```

The canonical index URL is
`https://raw.githubusercontent.com/learnrudi/registry/main/index.json`.

## Documentation maintenance

The change author owns documentation impact; the reviewer checks it before
acceptance. Update the current guide in the same change as observable behavior,
commands, contracts, schema, configuration or operating procedures. A dated
compliance record is evidence, not a replacement for current guidance.

| Changed surface | Current documentation to review |
| --- | --- |
| Catalog/schema/contribution contract | `README.md`, `CONTRIBUTING.md`, `SCHEMA.md`, `docs/stack-catalog.md`, `docs/skill-catalog.md` |
| Stack tools or operating behavior | The stack's README, primary operator `SKILL.md` and linked references; check against live tool schemas/source |
| Workflow skill | Its `SKILL.md`, bundled references/examples, and owning CLI/Compute/other package contract at the inspected revision |
| Runtime, package compatibility or release layout | Manifest and affected installation/contribution guides; regenerate indexes through the existing commands |

- Record the affected guides and source/consumer revisions in the PR. If no
  documentation change is needed, explain why using the actual behavior delta.
- Check examples, local links, command names and compatibility claims against
  source. Use repository-relative links within this repo and owning-repository
  links across Git boundaries; sibling checkouts are not assumed.
- Keep historical ledgers and archived instructions dated. Current guides must
  identify superseded advice and link to the accepted contract instead of
  silently replaying old rollout steps.
- Distinguish implemented source, published packages, installed artifacts and
  deployed services. Date live-state claims and link their observation evidence;
  a merge or successful build does not prove deployment.
- Keep secrets, account state and private records out of documentation. Record
  verification limits honestly, including unverified host/consumer acceptance.
- Use `.github/pull_request_template.md` for the review record. This checklist
  requires review; existing CI does not establish semantic documentation
  correctness or ongoing freshness.
