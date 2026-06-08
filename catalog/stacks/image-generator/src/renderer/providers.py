"""Provider dispatch layer for site-engine/render.

Unifies GeminiClient and OpenAIClient behind a common protocol so the CLI can
treat them interchangeably. Presets ('sketch' | 'photoreal' | 'edit') are
common vocabulary — each provider maps them to its own model IDs.

Reference-image support varies by provider:
  - gemini: supported on all presets
  - openai: only on 'edit' (gpt-image-1) or model 'dall-e-2'
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional, Protocol, Union

import PIL.Image


PROVIDERS = ("gemini", "openai", "replicate")
PRESETS = ("sketch", "photoreal", "edit")


class ImageProvider(Protocol):
    def resolve_model(self, model: str) -> str: ...

    def generate_image(
        self,
        prompt: str,
        reference: Optional[Union[Path, PIL.Image.Image]] = None,
        model: str = "photoreal",
        aspect_ratio: Optional[str] = None,
    ) -> bytes: ...


def get_provider(name: str, **kwargs) -> ImageProvider:
    """Return a configured image provider by name.

    Lazy imports keep startup cheap and avoid pulling the OpenAI SDK when
    only Gemini is in use (and vice versa). Supports both package and
    standalone-script import paths.
    """
    key = name.strip().lower()
    if key == "gemini":
        try:
            from .gemini_client import GeminiClient  # type: ignore[import-not-found]
        except ImportError:
            from gemini_client import GeminiClient  # type: ignore[import-not-found,no-redef]
        return GeminiClient(**kwargs)
    if key == "openai":
        try:
            from .openai_client import OpenAIClient  # type: ignore[import-not-found]
        except ImportError:
            from openai_client import OpenAIClient  # type: ignore[import-not-found,no-redef]
        return OpenAIClient(**kwargs)
    if key == "replicate":
        try:
            from .replicate_client import ReplicateClient  # type: ignore[import-not-found]
        except ImportError:
            from replicate_client import ReplicateClient  # type: ignore[import-not-found,no-redef]
        return ReplicateClient(**kwargs)
    raise ValueError(
        f"Unknown provider: {name!r}. Expected one of: {', '.join(PROVIDERS)}."
    )


def parse_spec(spec: str) -> tuple[str, str]:
    """Parse a 'provider:preset' spec string used by compare_cli.

    Examples:
      'gemini:sketch'    -> ('gemini', 'sketch')
      'openai:edit'      -> ('openai', 'edit')
      'openai:dall-e-3'  -> ('openai', 'dall-e-3')  # explicit model id
    """
    if ":" not in spec:
        raise ValueError(f"Spec must be 'provider:preset', got: {spec!r}")
    provider, preset = spec.split(":", 1)
    provider = provider.strip().lower()
    preset = preset.strip()
    if provider not in PROVIDERS:
        raise ValueError(
            f"Unknown provider in spec {spec!r}. Expected one of: {', '.join(PROVIDERS)}."
        )
    if not preset:
        raise ValueError(f"Empty preset in spec: {spec!r}")
    return provider, preset
