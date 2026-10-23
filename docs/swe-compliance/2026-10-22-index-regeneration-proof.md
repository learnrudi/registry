# Index regeneration proof for unattended review

The required Registry verification contract includes `indexes:sync`; the CI
workflow previously ran only `indexes:check`. Independent unattended review
therefore lacked direct evidence that every prescribed command ran on its
revision. Keep the existing check first, then exercise synchronization and reject
tracked index drift. Do not change any package/runtime/deployment behavior.

Red/green: `npm test -- src/quality-gates.test.ts` first failed because the sync
step was absent, then passed after adding the ordered steps. Current contribution
guidance explains the distinction. Full required gates, scoped debt scan,
independent read-only review, and provider CI must pass before acceptance.

Risk: medium; workflow execution changes but authority, actions, permissions,
secrets, deployment and package publication remain unchanged. This is a manually
reviewed prerequisite, not an automatically mergeable CI change. Source publication
and adoption are within the authorized single Registry automation pilot.

Horizontal decision: standardize the existing quality-gate contract; no new
index generator or parallel proof mechanism. The canonical commands remain in
package.json. Rollback is a source revert through normal GitHub review.

Local verification completed: 413 tests passed, one pre-existing test skipped;
validate, indexes:check, indexes:sync, tracked index diff, catalog cleanliness,
build, release verification, package dry-run, changed-stack verification and
repository debt scan passed. Scoped SWE scan reported one changed file and zero
findings. Independent fresh-context review passed Standards, Spec and local
Proof with no actionable findings. Provider CI remains the merge gate.
