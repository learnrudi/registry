# Document QA Stack

Visual QA inspection for HTML documents.

The stack renders an HTML document in Playwright, captures each page or `.artboard`, and asks Claude Vision to compare the rendered output against expected data and explicit checks.

## Tool

### `document_qa_inspect`

Inspect an HTML document once and return structured issues.

```json
{
  "html_path": "/path/to/document.html",
  "expected_data": {
    "unit_count": 15,
    "commercial_sf": 1800,
    "total_cost": "$6.66M"
  },
  "checks": [
    "Verify all unit counts match expected data",
    "Check that table totals add up correctly",
    "Ensure all images load properly"
  ],
  "output_dir": "/optional/path/for/screenshots"
}
```

Returns:

```json
{
  "summary": "Found 2 issue(s) across 17 page(s).",
  "issues": [
    {
      "page": 7,
      "type": "text_mismatch",
      "severity": "error",
      "description": "Floor 3 shows 3 units but should show 2.",
      "location": "Site plan diagram annotation",
      "expected": "Fl 3: 1BR + 1BR+ (2 units)",
      "found": "Fl 3: 1BR + 1BR+ + 2BR (3 units)"
    }
  ],
  "passedChecks": ["All images loaded"],
  "screenshots": ["/path/to/page-01.png"]
}
```

## Configuration

Required:

- `ANTHROPIC_API_KEY`

Optional:

- `ANTHROPIC_MODEL`, default `claude-sonnet-4-5-20250929`

Screenshots are saved to `~/.rudi/document-qa/<document-name>/` unless `output_dir` is provided.

## Scope

This v1 inspects and reports. It does not edit source files or automatically repair the document. Auto-fix can be added later as a separate tool once the edit contract is explicit.

## License

MIT

## Approved input and offline rendering

Document QA sends screenshots to Anthropic. Only singly linked `.html`/`.htm`
files, at most 10 MiB, inside operator-approved roots may enter that workflow.
Set `RUDI_DOCUMENT_QA_ROOTS` to an OS-path-delimited list of approved directories
(`:` on macOS/Linux, `;` on Windows). Default: `~/.rudi/outputs`. Tool arguments
cannot expand that scope; resolved symlinks must remain within an approved root.

Rendering uses a fresh offline browser and an internal virtual origin. Local
assets must stay within the document directory. Remote fonts, images, scripts,
WebSockets, WebRTC and external frames are blocked; bundle required assets
locally. Local assets have 16 MiB per-file / 64 MiB total limits. The browser
session expires after 60 seconds. The subsequent Anthropic inspection request
is the intended external disclosure; no provider calls occur in the test suite.

Run `npm test` after installing the locked Chromium browser with
`node node_modules/playwright/cli.js install chromium`. The host-listener egress
regression explicitly skips inside the offline OS verifier, where its listener
is prohibited; ordinary tests exercise it with real Chromium.
