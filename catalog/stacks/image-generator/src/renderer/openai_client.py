"""OpenAI image generation client for site-engine.

Matches GeminiClient shape: same presets ('sketch', 'photoreal', 'edit') and
the same `generate_image(prompt, reference=None, model=...)` surface so the
provider dispatcher can treat them interchangeably.

Provider differences (intentionally surfaced, not hidden):
  - DALL-E 3 does NOT accept a reference image — passing one raises a clear
    error.
  - GPT Image models accept multiple reference images; DALL-E 2 accepts one.
  - GPT Image and DALL-E 2 return base64 bytes; DALL-E 3 may return a URL
    which this client fetches back into bytes.
"""

from __future__ import annotations

import base64
import contextlib
import os
import urllib.request
from pathlib import Path
from typing import Optional, Union

import PIL.Image
from openai import OpenAI

from model_config import (
    DEFAULT_MODELS,
    OPENAI_DALL_E_3_SIZE_BY_ASPECT_RATIO,
    OPENAI_GPT_IMAGE_2_SIZE_BY_ASPECT_RATIO,
    OPENAI_GPT_IMAGE_LEGACY_SIZE_BY_ASPECT_RATIO,
)

try:
    from .gemini_client import load_env  # type: ignore[import-not-found]
except ImportError:
    from gemini_client import load_env  # type: ignore[import-not-found,no-redef]


DEFAULT_SKETCH_MODEL = DEFAULT_MODELS["openai"]["sketch"]
DEFAULT_PHOTOREAL_MODEL = DEFAULT_MODELS["openai"]["photoreal"]
DEFAULT_EDIT_MODEL = DEFAULT_MODELS["openai"]["edit"]

GPT_IMAGE_SKETCH_QUALITY = "low"
GPT_IMAGE_PHOTOREAL_QUALITY = "high"
DALL_E_3_SKETCH_QUALITY = "standard"
DALL_E_3_PHOTOREAL_QUALITY = "hd"

GPT_IMAGE_2_SIZE_BY_ASPECT_RATIO = OPENAI_GPT_IMAGE_2_SIZE_BY_ASPECT_RATIO
GPT_IMAGE_SIZE_BY_ASPECT_RATIO = OPENAI_GPT_IMAGE_LEGACY_SIZE_BY_ASPECT_RATIO

DALL_E_3_SIZE_BY_ASPECT_RATIO = OPENAI_DALL_E_3_SIZE_BY_ASPECT_RATIO


def _is_gpt_image_model(model_id: str) -> bool:
    return model_id.startswith("gpt-image") or model_id.startswith("chatgpt-image")


def _is_gpt_image_2_model(model_id: str) -> bool:
    return model_id.startswith("gpt-image-2")


def _model_supports_reference(model_id: str) -> bool:
    return _is_gpt_image_model(model_id) or model_id == "dall-e-2"


def _max_reference_count(model_id: str) -> int:
    if _is_gpt_image_model(model_id):
        return 16
    if model_id == "dall-e-2":
        return 1
    return 0


class OpenAIClient:
    def __init__(
        self,
        api_key: Optional[str] = None,
        env_path: Optional[Path] = None,
        sketch_model: Optional[str] = None,
        photoreal_model: Optional[str] = None,
        edit_model: Optional[str] = None,
    ) -> None:
        env = load_env(env_path) if env_path else {}
        resolved_key = api_key or os.environ.get("OPENAI_API_KEY") or env.get("OPENAI_API_KEY")
        if not resolved_key:
            raise RuntimeError("OPENAI_API_KEY not found in environment")
        self._client = OpenAI(api_key=resolved_key)
        self.sketch_model = sketch_model or os.environ.get("OPENAI_MODEL_SKETCH") or env.get("OPENAI_MODEL_SKETCH", DEFAULT_SKETCH_MODEL)
        self.photoreal_model = photoreal_model or os.environ.get("OPENAI_MODEL_PHOTOREAL") or env.get("OPENAI_MODEL_PHOTOREAL", DEFAULT_PHOTOREAL_MODEL)
        self.edit_model = edit_model or os.environ.get("OPENAI_MODEL_EDIT") or env.get("OPENAI_MODEL_EDIT", DEFAULT_EDIT_MODEL)

    def resolve_model(self, model: str) -> str:
        if model == "sketch":
            return self.sketch_model
        if model == "photoreal":
            return self.photoreal_model
        if model == "edit":
            return self.edit_model
        return model

    def _quality_for_preset(self, preset: str, model_id: str) -> Optional[str]:
        if _is_gpt_image_model(model_id):
            if preset == "sketch":
                return GPT_IMAGE_SKETCH_QUALITY
            if preset == "photoreal":
                return GPT_IMAGE_PHOTOREAL_QUALITY
            return None

        if model_id == "dall-e-3":
            if preset == "sketch":
                return DALL_E_3_SKETCH_QUALITY
            if preset == "photoreal":
                return DALL_E_3_PHOTOREAL_QUALITY
            return None

        if preset == "sketch":
            return GPT_IMAGE_SKETCH_QUALITY
        if preset == "photoreal":
            return GPT_IMAGE_PHOTOREAL_QUALITY
        return None

    def generate_image(
        self,
        prompt: str,
        reference: Optional[Union[Path, PIL.Image.Image, list]] = None,
        model: str = "photoreal",
        aspect_ratio: Optional[str] = None,
    ) -> bytes:
        """Generate an image and return raw bytes.

        With reference images, calls the edit endpoint (GPT Image / dall-e-2).
        Without a reference, calls the generate endpoint.

        GPT Image models accept up to 16 reference images. DALL-E 2 accepts one.
        """
        model_id = self.resolve_model(model)
        quality = self._quality_for_preset(model, model_id)
        refs = self._normalize_references(reference)

        if refs:
            if not _model_supports_reference(model_id):
                raise RuntimeError(
                    f"Model {model_id} does not support reference images. "
                    f"Use a GPT Image model such as 'gpt-image-2' instead."
                )
            max_refs = _max_reference_count(model_id)
            if len(refs) > max_refs:
                raise RuntimeError(
                    f"Model {model_id} accepts up to {max_refs} reference images, got {len(refs)}."
                )
            return self._edit(
                model_id,
                prompt,
                refs,
                quality=quality,
                aspect_ratio=aspect_ratio,
            )

        return self._generate(model_id, prompt, quality=quality, aspect_ratio=aspect_ratio)

    def _size_for_aspect_ratio(self, model_id: str, aspect_ratio: Optional[str]) -> str:
        if not aspect_ratio:
            return "1024x1024"

        if _is_gpt_image_2_model(model_id):
            size = GPT_IMAGE_2_SIZE_BY_ASPECT_RATIO.get(aspect_ratio)
        elif _is_gpt_image_model(model_id):
            size = GPT_IMAGE_SIZE_BY_ASPECT_RATIO.get(aspect_ratio)
        elif model_id == "dall-e-3":
            size = DALL_E_3_SIZE_BY_ASPECT_RATIO.get(aspect_ratio)
        elif model_id == "dall-e-2":
            size = "1024x1024" if aspect_ratio == "1:1" else None
        else:
            size = GPT_IMAGE_SIZE_BY_ASPECT_RATIO.get(aspect_ratio)

        if not size:
            raise RuntimeError(
                f"Model {model_id} does not support aspect ratio {aspect_ratio}."
            )
        return size

    def _generate(
        self,
        model_id: str,
        prompt: str,
        quality: Optional[str] = None,
        aspect_ratio: Optional[str] = None,
    ) -> bytes:
        kwargs: dict = {
            "model": model_id,
            "prompt": prompt,
            "size": self._size_for_aspect_ratio(model_id, aspect_ratio),
            "n": 1,
        }
        if model_id != "dall-e-2" and quality is not None:
            kwargs["quality"] = quality

        response = self._client.images.generate(**kwargs)
        return self._extract_bytes(response, model_id)

    def _edit(
        self,
        model_id: str,
        prompt: str,
        references: list[Union[Path, PIL.Image.Image]],
        quality: Optional[str] = None,
        aspect_ratio: Optional[str] = None,
    ) -> bytes:
        ref_entries = [self._to_path(reference) for reference in references]
        ref_paths = [entry[0] for entry in ref_entries]
        temp_paths = [entry[0] for entry in ref_entries if entry[1]]
        try:
            with contextlib.ExitStack() as stack:
                handles = [stack.enter_context(open(ref_path, "rb")) for ref_path in ref_paths]
                image = handles if len(handles) > 1 else handles[0]
                kwargs: dict = {
                    "model": model_id,
                    "image": image,
                    "prompt": prompt,
                    "size": self._size_for_aspect_ratio(model_id, aspect_ratio),
                    "n": 1,
                }
                if model_id != "dall-e-2" and quality is not None:
                    kwargs["quality"] = quality
                response = self._client.images.edit(
                    **kwargs,
                )
        finally:
            for temp_path in temp_paths:
                temp_path.unlink(missing_ok=True)
        return self._extract_bytes(response, model_id)

    @staticmethod
    def _normalize_references(reference) -> list:
        if reference is None:
            return []
        if isinstance(reference, (list, tuple)):
            return list(reference)
        return [reference]

    @staticmethod
    def _to_path(reference: Union[Path, PIL.Image.Image]) -> tuple[Path, bool]:
        if isinstance(reference, Path):
            return reference, False
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as file:
            tmp = Path(file.name)
        reference.save(tmp)
        return tmp, True

    @staticmethod
    def _extract_bytes(response, model_id: str) -> bytes:
        data = response.data or []
        if not data:
            raise RuntimeError(f"No image data returned by {model_id}.")
        first = data[0]
        b64 = getattr(first, "b64_json", None)
        if b64:
            return base64.b64decode(b64)
        url = getattr(first, "url", None)
        if url:
            with urllib.request.urlopen(url, timeout=120) as resp:
                return resp.read()
        raise RuntimeError(f"No image bytes or URL in response from {model_id}.")
