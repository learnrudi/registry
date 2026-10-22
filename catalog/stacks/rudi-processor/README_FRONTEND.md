# Optional RUDI Processor HTTP interface

The default installed MCP server uses stdio. It does not start this optional HTTP
server. The HTTP interface provides authenticated search, metadata, download,
upload, directory processing, and metadata deletion within configured workspace
roots. Run it only for trusted operators: anyone holding its token can invoke
these operations, including deletion and provider-backed processing.

## Start locally

Install the processor's normal requirements and the optional HTTP requirements
in your virtual environment:

```bash
python -m pip install -r requirements.txt -r requirements-http.txt
```

Set `RUDI_PROCESSOR_API_TOKEN` to a cryptographically random token of at least
32 ASCII characters without whitespace through your secret manager or shell
environment. Do not put the token in a URL or source file. Startup fails if this
configuration is missing or invalid. Rotate the token by replacing the environment
value and restarting the optional server.

`RUDI_BASE_DIR` selects the inbox (default `~/.rudi/workspaces/rudi-processor/inbox`).
`RUDI_INDEX_DIR` selects the index (default `~/.rudi/workspaces/rudi-processor/index`).
Keep both directories protected from untrusted local writers. The API constrains
directory processing and original-file downloads to the inbox, and metadata
reads/deletion to the index. A directory batch rejects symlink children that escape
the inbox before starting. Opaque upload storage names are created exclusively;
original filenames remain display metadata. Invalid path-like names are rejected.

```bash
uvicorn api_server:app --host 127.0.0.1 --port 8001
```

Visit [the local frontend](http://127.0.0.1:8001/), enter the configured token, and
select **Connect**. The frontend sends same-origin requests with an Authorization
header. It keeps the token in page memory only; reload requires entering it again.
Opening the HTML file directly is no longer supported. Cross-origin API access is
not enabled. `python api_server.py` also binds only to loopback (port 8000).

Do not expose the listener publicly. Remote access requires a separately managed
TLS/authentication deployment; this local single-operator interface does not
provide individual identities, role-based authorization, or remote hosting controls.

## API contract

Every `/api` request requires `Authorization: Bearer <configured-token>`.
Missing/incorrect credentials return 401; invalid server token configuration returns
503 if lifespan startup was bypassed. Only the fixed frontend HTML and script are
public. Path escapes return 403, malformed upload filenames/hash identifiers return
400, and absent files/directories return 404.

- `GET /api/stats` — statistics
- `GET /api/search?q=query&filters=images,documents` — metadata search
- `POST /api/upload` — multipart file upload and processing
- `POST /api/process/directory?directory_path=...` — inbox-contained batch
- `GET /api/categories` — indexed categories
- `GET /api/file/{hash}` — metadata
- `GET /api/download/{hash}` — original file inside the inbox
- `DELETE /api/clear-metadata` — delete the existing metadata date partitions
- `WS /ws` — programmatic clients must send the same Authorization header during
  the handshake; unauthenticated connections close before acceptance

The browser UI currently uses REST search and statistics. It does not connect to
WebSocket, and browser-native WebSocket cannot supply this Authorization header.
No token-in-query fallback is supported. The existing drag/drop and file-click UI
remain display prototypes; use the API for uploading/downloading. Metadata date
partition selection remains the existing `2025-08` layout.

## Security regression checks

HTTP tests are separate from stdio tests because HTTP dependencies are optional:

```bash
python -m pip install -r requirements-http-test.txt
python -m unittest discover -s tests/http -p 'test_*.py' -v
node --test tests/frontend-security.test.mjs
```

ASGI tests use temporary directories and mock document/LLM processors at their
boundary. They make no provider requests. Frontend tests execute the shipped script
against a DOM fixture that rejects HTML sinks, verify literal hostile metadata and
click paths, and verify same-origin bearer-header authentication without token URLs
or persistence. Full browser and provider integration are separate checks.
