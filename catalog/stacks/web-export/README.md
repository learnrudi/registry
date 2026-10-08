
### Rendering security and budgets

HTML renders in a fresh browser context at an internal virtual origin. Scripts
can lay out the document, but networking, WebSockets, WebRTC, service workers,
frames and forms cannot reach the host network. Local HTML/CSS/JS/JSON, images
and fonts must be under the document's real directory; symlinks cannot escape
that directory and multiply-linked files are rejected. Bundle remote assets
locally before exporting. Blocked resources appear in the normal diagnostics.

Caller-supplied `browser_ws_endpoint` is accepted only when it exactly matches
operator process configuration `RUDI_WEB_EXPORT_BROWSER_ENDPOINT`; even then a
new isolated context is used. Existing browser cookies/context are never reused.

Render budgets: 16,384 CSS pixels per side, 40 million scaled pixels per page,
100 pages/artboards, 200 million aggregate pixels, 128 MiB cumulative output
(including temporary review rasters), and 60 seconds for the operation, including
browser acquisition and PDF review. CSS print sizes and DOM-derived dimensions
are checked too. Imported and adopted print stylesheets are included. Scripted
`beforeprint` layout runs once before validation, then page scripts are frozen
through PDF rendering. Both PDF and PNG pause animations at their ready frame and
freeze page scripts before measuring, so timers cannot change the captured size.
PDF pagination uses a conservative page limit plus one
sentinel page; exceeding the limit fails rather than returning a truncated PDF.
Actual PDF page dimensions are checked before output and raster review. Rasterizer
children use the remaining deadline and bounded diagnostics; preview DPI follows
the request. Temporary analysis files are removed as each page is reviewed.
Each local asset is capped at 16 MiB; a document session can load 64 MiB across
512 requests. Exceeding a budget fails the export. Files already emitted before
a later failure may remain and are not reported as successful artifacts.

`npm test` exercises a real loopback listener to prove renderer egress is blocked.
That one test explicitly skips inside the OS-contained offline stack verifier,
where creating its listener is itself forbidden; run the normal suite separately.
