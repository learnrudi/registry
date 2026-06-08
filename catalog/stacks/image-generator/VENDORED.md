# Renderer Provider Modules

These provider clients started as renderer modules from an internal prototype
and now live in this stack as the canonical implementation.

Provider files:

- `__init__.py`
- `providers.py`
- `gemini_client.py`
- `openai_client.py`
- `replicate_client.py`

Stack-specific behavior:

- Removed the renderer's default `api/.env` path fallback.
- Provider clients now read provider credentials from the process environment
  by default, matching RUDI secret injection.
- OpenAI defaults use `gpt-image-2`; older OpenAI image models remain selectable
  by explicit model id or env override.
- Gemini defaults use `gemini-3.1-flash-image-preview` for sketch and
  `gemini-3-pro-image-preview` for photoreal output.
- Added stack-side output handling for collision-resistant auto filenames and
  image-format-aware file extensions.
