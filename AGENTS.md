# RUDI Registry

Source of truth for stacks, runtimes, binaries, and agents.

## Structure

```
index.json                    # Package index (CLI searches this)
catalog/
├── stacks/                   # MCP server stacks
│   ├── slack/
│   │   ├── manifest.json     # Stack metadata + secrets
│   │   └── node/src/         # MCP server code
│   └── ...
├── runtimes/*.json           # Runtime definitions (node, python, deno)
├── binaries/*.json           # Binary definitions (ffmpeg, ripgrep)
└── agents/*.json             # Agent definitions (Codex, codex, gemini)

GitHub Releases (v1.0.0):     # Binary downloads
├── node-20.10.0-darwin-arm64.tar.gz
├── python-3.12-darwin-arm64.tar.gz
├── ffmpeg-6.0-darwin-arm64.tar.gz
└── ...
```

## Stack Inventory

Do not maintain a hardcoded stack list in this file. Discover the current public
inventory from:

```bash
node -e "const idx=require('./index.json'); console.log(idx.packages.stacks.official.map(s=>s.id).join('\n'))"
npm run validate:v2
```

Public catalog source must stay generic and portable. Personal workflows, local
absolute paths, account state, run artifacts, and brand-specific defaults belong
in local `.rudi` state or private/local skills, not in default registry packages.

## URLs

- Index: `https://raw.githubusercontent.com/learnrudi/registry/main/index.json`
- Binaries: `https://github.com/learnrudi/registry/releases/download/v1.0.0/{name}.tar.gz`

## Adding a Stack

1. Create `catalog/stacks/{name}/manifest.json`
2. Add MCP server code in `node/` or `python/`
3. Add entry to `index.json` under `packages.stacks.official`
4. Push to main branch

## Manifest Format

```json
{
  "id": "slack",
  "name": "Slack",
  "version": "1.0.0",
  "description": "Send messages, search channels...",
  "runtime": "node",
  "command": ["npx", "tsx", "node/src/index.ts"],
  "provides": {
    "tools": ["slack_send_message", "slack_list_channels"]
  },
  "requires": {
    "binaries": ["ffmpeg"],
    "secrets": [
      { "name": "SLACK_BOT_TOKEN", "required": true }
    ]
  },
  "meta": {
    "author": "RUDI",
    "license": "MIT",
    "category": "communication",
    "tags": ["slack"]
  }
}
```
