# RUDI Registry

Official registry of MCP stacks, binaries, agents, runtimes, and skills for the RUDI CLI.

## Package Types

| Type | Description | Location |
|------|-------------|----------|
| **Stack** | MCP servers with tools | `catalog/stacks/{id}/` |
| **Binary** | Standalone binaries/CLIs | `catalog/binaries/{id}.json` |
| **Agent** | AI coding assistants | `catalog/agents/{id}.json` |
| **Runtime** | Language interpreters | `catalog/runtimes/{id}.json` |
| **Skill** | Ready-to-run, editable agent workflow packages | `catalog/skills/{id}.md` |

## Usage

Packages are consumed by the [RUDI CLI](https://github.com/learnrudi/cli):

```bash
# Search for packages
rudi search whisper

# Install packages
rudi install whisper
rudi install ffmpeg
rudi install node

# List installed
rudi list
```

## Repository Structure

```
index.json                    # Package index (all metadata)

catalog/
├── stacks/                   # MCP server stacks
│   └── {stack-id}/
│       ├── manifest.json     # Stack metadata
│       └── node/src/ or python/src/
│
├── skills/                   # Ready-to-run skill packages
│   └── {skill-id}.md         # Markdown source with package frontmatter
│
├── binaries/                 # Binary manifests
│   └── {binary-id}.json
│
├── agents/                   # Agent manifests
│   └── {agent-id}.json
│
└── runtimes/                 # Runtime manifests
    └── {runtime-id}.json

dist/                         # GitHub Releases (binaries)
├── node-20.10.0-darwin-arm64.tar.gz
├── python-3.12-darwin-arm64.tar.gz
└── ffmpeg-6.0-darwin-arm64.tar.gz
```

## Creating a Stack

1. Create folder: `catalog/stacks/{stack-id}/`

2. Add `manifest.json`:

```json
{
  "id": "my-stack",
  "name": "My Stack",
  "version": "1.0.0",
  "description": "What it does",
  "runtime": "node",
  "command": ["npx", "tsx", "node/src/index.ts"],
  "provides": {
    "tools": ["my_tool_1", "my_tool_2"]
  },
  "related": {
    "skills": ["skill:my-workflow"]
  },
  "requires": {
    "binaries": ["ffmpeg"],
    "secrets": [
      { "name": "MY_API_KEY", "label": "API Key", "required": true }
    ]
  },
  "meta": {
    "author": "Your Name",
    "license": "MIT",
    "category": "productivity",
    "tags": ["example"]
  }
}
```

3. Add MCP server code in `node/src/index.ts` or `python/src/server.py`

4. Add entry to `index.json` under `packages.stacks.official`

### Secrets Flow

When users install a stack with secrets:

1. `rudi install my-stack` creates `~/.rudi/stacks/my-stack/.env` with placeholders
2. User runs `rudi secrets set MY_API_KEY` to add their key
3. MCP registration reads secrets and injects into agent configs (Claude, Codex, Gemini)

Use `related.skills` for companion workflows that help agents use a stack. Do not list skills in `provides.tools`; `provides.tools` is only for MCP tools exposed by the stack.

## Creating a Skill

Registry skills should be generic enough to publish and complete enough to use
immediately. Installed skill files are user-editable local copies; put personal
voice, brand rules, client-specific paths, and approval workflows in local
skills or overrides, not in public defaults.

1. Create file: `catalog/skills/{skill-id}.md`

2. Add YAML frontmatter + content. The v2 validator and compiler derive the package id, install path, and `kind:"skill"` from the file path.

```markdown
---
name: My Skill
description: What this skill does
version: 1.0.0
category: coding
tags:
  - example
requires:
  stacks:
    - stack:my-stack
author: Your Name
---

# Skill Title

Your skill instructions here...
```

3. Run validation and compile:

```bash
npm run validate:v2
npm run compile
```

For legacy consumers of the root `index.json`, also keep the matching `packages.skills` entry updated until that index is fully generated from v2 catalog packages.

## Adding a Binary

Binaries use install types to determine how they're installed:

| Install Type | Source | Examples |
|--------------|--------|----------|
| `binary` | Upstream URL | ffmpeg, jq |
| `npm` | npm registry | vercel, wrangler |
| `pip` | PyPI | httpie |
| `system` | User installs | docker, git |

Example binary manifest (`catalog/binaries/jq.json`):

```json
{
  "id": "jq",
  "name": "jq",
  "version": "1.7.1",
  "description": "JSON processor",
  "installType": "binary",
  "binary": "jq",
  "upstream": {
    "darwin-arm64": "https://github.com/jqlang/jq/releases/download/jq-1.7.1/jq-macos-arm64",
    "darwin-x64": "https://github.com/jqlang/jq/releases/download/jq-1.7.1/jq-macos-amd64",
    "linux-x64": "https://github.com/jqlang/jq/releases/download/jq-1.7.1/jq-linux-amd64"
  }
}
```

## Available Stacks

| Stack | Description | Auth |
|-------|-------------|------|
| whisper | Local audio transcription | None |
| google-workspace | Gmail, Sheets, Docs, Drive, Calendar | OAuth |
| google-ai | Gemini, Imagen, Veo | API Key |
| openai | DALL-E, Whisper, TTS, Sora | API Key |
| notion-workspace | Pages, databases, search | API Key |
| slack | Messages, channels, files | Bot Token |
| zoho-mail | Email via Zoho | OAuth |
| content-extractor | YouTube, Reddit, TikTok, articles | None |
| video-editor | ffmpeg-based editing | None |
| web-export | HTML to PNG/PDF | None |
| ms-office | Read .docx/.xlsx | None |
| social-media | Twitter, LinkedIn, Facebook, Instagram | OAuth |
| postgres | PostgreSQL database queries | Connection URL |
| sqlite | SQLite database queries | File path |

## Categories

**Stacks:** ai-generation, ai-local, productivity, communication, social-media, data-extraction, document-processing, media, deployment, utilities

**Binaries:** media, data, devops, utilities, ai-ml, version-control

**Prompts:** coding, writing, creative, utilities, general

## URLs

- **Index:** `https://raw.githubusercontent.com/learnrudi/registry/main/index.json`
- **Stacks:** `https://raw.githubusercontent.com/learnrudi/registry/main/catalog/stacks/{id}/`
- **Binaries:** `https://github.com/learnrudi/registry/releases/download/v1.0.0/`

## Security

Never include API keys or secrets in the registry. Stacks declare required secrets in `manifest.json` under `requires.secrets`. When installed, secrets are stored locally in `~/.rudi/secrets.json` with file permissions `0600`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on adding packages to the registry.

## License

MIT
