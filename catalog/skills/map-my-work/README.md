# Map My Work

Map My Work is a guided conversation that turns a recurring activity into a
clear task map. You will finish with a task table, matching Mermaid diagram
source, open questions, and one small AI-assisted step you can test safely.

## Use it with Microsoft 365 Copilot

1. Open `references/map-my-work.txt` in this folder and use GitHub's **Download
   raw file** control.
2. Start a new Copilot conversation in the approved account you use for the
   information you plan to discuss.
3. Attach `map-my-work.txt` and ask Copilot to follow it. If your Copilot surface
   does not accept text attachments, open the file, copy all of its text, and
   paste it into the conversation instead.
4. Add a description or transcript of one recurring activity, or let the file
   start the interview.
5. Answer one question at a time. Correct invented details and leave anything
   unresolved marked as unknown.
6. Confirm the final table and diagram before trying the suggested prompt.

You can begin with:

> Follow the attached Map My Work instructions. Interview me one question at a
> time about a recurring activity, then help me confirm the task map before you
> suggest one small AI-assisted test.

`map-my-work.txt` is a portable instruction file, not an installed Copilot
agent. Attachment support and available Copilot capabilities can vary by the
Microsoft 365 product, account, and administrator settings. Do not include
secrets or information your organization has not approved for that environment.

## Other AI assistants

Attach the same file or paste its contents into an assistant that supports your
approved work information. In RUDI or another compatible skill host, install
and invoke the `map-my-work` skill instead.

## Source of truth

The detailed method is maintained in `references/map-my-work.txt`. The neighboring
`SKILL.md` loads that same method for skill-aware hosts, while this README only
explains attendee setup. This keeps the portable and installed experiences
aligned without claiming that every AI product supports the same features.
