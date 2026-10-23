# Registry source review and delivery

An automated source-delivery pilot processes an explicitly enrolled pull request.
The operator accepts its task, allowed paths and source authority before admission.
A passing CI run by itself does not enroll a PR or grant merge permission.

## Review and repair

An independent reviewer checks the current source change against its accepted
task, engineering standards and revision-bound verification evidence. A source
owner may repair findings only within the accepted task. A repaired revision
needs fresh CI and review before an ordinary protected-branch merge.

Follow the [required checks](../CONTRIBUTING.md#required-checks), including index
regeneration through the canonical commands. Do not hand-edit the generated
index. Keep evidence associated with the revision it actually verified.

## Source and runtime boundaries

A source merge, a build artifact, an installed package and a running service are
separate outcomes. Source automation must not infer permission to install,
publish packages, change databases, configure providers or deploy applications.
Private account choices, host paths, credentials and run records belong in the
operator's private configuration.
