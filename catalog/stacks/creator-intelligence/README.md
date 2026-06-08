# Creator Intelligence Stack

Creator audit and style-reference tooling for local RUDI research workflows.

This stack owns orchestration and artifacts, not low-level social extraction. It
should call or compose existing extractor stacks and local media tools instead
of duplicating TikTok, YouTube, Reddit, or article extraction logic.

Build status and remaining phases are tracked in
[`docs/BUILD-CHECKLIST.md`](docs/BUILD-CHECKLIST.md).

## Tools

- `creator_style_reference_intake`: download a public shortform video into a
  temp directory, generate `source-info.json`, `contact-sheet-1fps.jpg`,
  `keyframes-sheet.jpg`, and `README.md`, then remove the source video unless
  `keep_source` is explicitly set.
- `creator_list_style_references`: list existing style-reference artifact
  directories under the creator-intelligence research tree.
- `creator_read_style_reference`: read one style-reference README and metadata.
- `creator_transcribe_reference`: extract `audio.wav` from an existing style
  reference and, when local Whisper is available, write `transcript.txt`,
  `transcript.json`, `transcript.vtt`, and `transcript-status.json`.
- `creator_profile_video_index`: fetch a creator profile video window and write
  `01-profile-snapshot.json`, `02-video-index.json`, `02-video-index.csv`, plus
  latest/popular/oldest CSV cuts.
- `creator_full_audit_inventory`: inspect a full creator-audit folder for
  platform directories, required docs, normalized counts, and symlink debt.
- `creator_import_legacy_tiktok_extracts`: copy legacy TikTok `tiktok-*.json`
  extracts and analysis files into the canonical audit folder without symlinks.
- `creator_build_unified_export`: normalize TikTok, YouTube, Substack, and
  LinkedIn captures into `{creator_slug}-unified-export.json` and `.csv`.
- `creator_generate_audit_documents`: generate `PLATFORM-REGISTRY.md`,
  `CROSS-PLATFORM-SNAPSHOT.md`, and `FINAL-SYNTHESIS.md` from the unified
  export.
- `creator_inventory`: summarize current creator-intelligence and
  youtube-creators research artifacts.

## Default Output Root

```text
~/.rudi/research/creator-intelligence
```

Style references are written to:

```text
{output_root}/{creator_slug}/{platform}/07-style-references/{reference_slug}/
  README.md
  source-info.json
  contact-sheet-1fps.jpg
  keyframes-sheet.jpg
  audio.wav                    # after creator_transcribe_reference
  transcript.txt               # when local Whisper succeeds
  transcript-status.json
```

Downloaded source media is temporary by default and must not be reused as a RUDI
content asset.

Profile indexes are written to:

```text
{output_root}/{creator_slug}/{platform}/
  01-profile-snapshot.json
  02-video-index.json
  02-video-index.csv
  03-latest-videos.csv
  04-popular-videos.csv
  05-oldest-videos.csv
  PROFILE-OVERVIEW.md
```

For TikTok, profile ordering and available metrics depend on what `yt-dlp` can
retrieve at run time. Pinned videos, bio links, playlists, follower counts, and
visual profile state still require a browser capture layer.

Full audit folders follow a generic `{creator_slug}-full` target shape:

```text
{output_root}/{creator_slug}-full/
  PLATFORM-REGISTRY.md
  CROSS-PLATFORM-SNAPSHOT.md
  FINAL-SYNTHESIS.md
  {creator_slug}-unified-export.json
  {creator_slug}-unified-export.csv
  tiktok/
    extracted-videos/
  youtube/
    catalog.json
    transcripts/
  substack/
  linkedin/
    posts-clean.json
```

The stack copies legacy TikTok extracts rather than creating symlinks. Existing
legacy folders may still contain symlinks; `creator_full_audit_inventory`
reports them so they can be cleaned up deliberately.

## Install

```bash
rudi install stack:creator-intelligence
rudi index --json
rudi integrate codex
```

Restart the agent after indexing so the new tools appear.
