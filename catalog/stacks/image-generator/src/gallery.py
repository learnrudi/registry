"""Local HTML gallery generation for provider comparison runs."""

from __future__ import annotations

import json
from html import escape as html_escape
from pathlib import Path
from typing import Any


def slugify(value: str) -> str:
    return "".join(c if c.isalnum() else "-" for c in value).strip("-").lower() or "item"


def write_gallery(
    out_dir: Path,
    prompt_label: str,
    references: list[Path],
    results: list[dict[str, Any]],
) -> Path:
    tiles: list[str] = []
    for result in results:
        spec = result["spec"]
        if result["ok"]:
            caption = (
                f"{spec} - {result['model']} - {result['ms']} ms - "
                f"{result['kb']} KB"
            )
            body = f'<img src="{html_escape(result["file"], quote=True)}" loading="lazy" />'
        else:
            caption = f"{spec} - FAILED"
            error = result.get("error", {})
            body = f'<pre class="err">{html_escape(json.dumps(error, indent=2))}</pre>'
        tiles.append(
            f"<figure><figcaption>{html_escape(caption)}</figcaption>{body}</figure>"
        )

    ref_line = ""
    if references:
        names = ", ".join(html_escape(path.name) for path in references)
        ref_line = f"<p>references ({len(references)}): <code>{names}</code></p>"

    html = f"""<!doctype html>
<meta charset="utf-8" />
<title>image-generator comparison</title>
<style>
  :root {{ color-scheme: dark; }}
  body {{ margin: 24px; font: 14px/1.4 ui-sans-serif, system-ui; background: #0b0f14; color: #e8edf2; }}
  h1 {{ font-size: 18px; margin: 0 0 8px; }}
  .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; margin-top: 16px; }}
  figure {{ margin: 0; padding: 12px; border: 1px solid #1e2a36; border-radius: 8px; background: #0f1620; }}
  img {{ width: 100%; height: auto; border-radius: 6px; display: block; }}
  figcaption {{ margin-bottom: 10px; color: #b7c2cc; font-family: ui-monospace, monospace; font-size: 12px; }}
  code {{ color: #9cd1ff; }}
  pre.err {{ color: #ff9b9b; white-space: pre-wrap; font-size: 12px; margin: 0; }}
</style>
<h1>image-generator comparison</h1>
<p>prompt: <code>{html_escape(prompt_label)}</code></p>
{ref_line}
<div class="grid">
{''.join(tiles)}
</div>
"""
    index = out_dir / "index.html"
    index.write_text(html, encoding="utf-8")
    return index
