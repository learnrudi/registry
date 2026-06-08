"""Gemini image generation client for site-engine.

Loads GEMINI_API_KEY from the environment (or an explicit .env path). Wraps
google.genai with two model presets: 'sketch' (fast) and 'photoreal' (higher
quality).

The spatial/visual separation pattern:
  - Spatial: the reference image (produced by site-engine exporters) locks
    geometry. Gemini does not move/rotate/resize buildings in the reference.
  - Visual: the prompt string locks style, context, lighting, materials.

Both are loaded by callers; this module just makes the Gemini call.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional, Union

import PIL.Image
from google import genai
from google.genai import types

from model_config import DEFAULT_MODELS


DEFAULT_SKETCH_MODEL = DEFAULT_MODELS["gemini"]["sketch"]
DEFAULT_PHOTOREAL_MODEL = DEFAULT_MODELS["gemini"]["photoreal"]


def load_env(path: Path) -> dict:
    """Parse a .env file into a dict. No python-dotenv dependency."""
    env: dict = {}
    if not path.exists():
        return env
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k] = v.strip().strip('"').strip("'")
    return env


class GeminiClient:
    def __init__(
        self,
        api_key: Optional[str] = None,
        env_path: Optional[Path] = None,
        sketch_model: Optional[str] = None,
        photoreal_model: Optional[str] = None,
    ) -> None:
        env = load_env(env_path) if env_path else {}
        resolved_key = api_key or os.environ.get("GEMINI_API_KEY") or env.get("GEMINI_API_KEY")
        if not resolved_key:
            raise RuntimeError("GEMINI_API_KEY not found in environment")
        self._client = genai.Client(api_key=resolved_key)
        self.sketch_model = sketch_model or os.environ.get("GEMINI_MODEL_SKETCH") or env.get("GEMINI_MODEL_SKETCH", DEFAULT_SKETCH_MODEL)
        self.photoreal_model = photoreal_model or os.environ.get("GEMINI_MODEL_PHOTOREAL") or env.get("GEMINI_MODEL_PHOTOREAL", DEFAULT_PHOTOREAL_MODEL)

    def resolve_model(self, model: str) -> str:
        if model == "sketch":
            return self.sketch_model
        if model == "photoreal":
            return self.photoreal_model
        return model

    def generate_image(
        self,
        prompt: str,
        reference: Optional[Union[Path, PIL.Image.Image, list]] = None,
        model: str = "photoreal",
        aspect_ratio: Optional[str] = None,
    ) -> bytes:
        """Generate an image and return raw bytes.

        `reference` may be a single Path/Image or a list of them.
        Raises RuntimeError if the response contains no image.
        """
        model_id = self.resolve_model(model)

        # Imagen uses a separate text-to-image API (no reference support).
        if model_id.startswith("imagen-"):
            return self._generate_imagen(prompt, model_id, aspect_ratio=aspect_ratio)

        refs: list = []
        opened_images: list[PIL.Image.Image] = []
        if reference is not None:
            raw = reference if isinstance(reference, (list, tuple)) else [reference]
            for r in raw:
                if isinstance(r, PIL.Image.Image):
                    refs.append(r)
                else:
                    image = PIL.Image.open(r)
                    image.load()
                    opened_images.append(image)
                    refs.append(image)

        contents: list = [prompt, *refs]

        try:
            response = self._client.models.generate_content(
                model=model_id,
                contents=contents,
                config=types.GenerateContentConfig(
                    response_modalities=["IMAGE"],
                    image_config=types.ImageConfig(aspect_ratio=aspect_ratio)
                    if aspect_ratio
                    else None,
                ),
            )
        finally:
            for image in opened_images:
                image.close()

        candidates = response.candidates or []
        if not candidates:
            raise RuntimeError(f"No candidates returned by {model_id}.")
        content = candidates[0].content
        parts = content.parts if content is not None else None
        if not parts:
            raise RuntimeError(f"No content parts returned by {model_id}.")

        for part in parts:
            inline = getattr(part, "inline_data", None)
            if inline is not None and inline.data is not None:
                return inline.data

        text_parts = [getattr(p, "text", "") for p in parts if getattr(p, "text", None)]
        raise RuntimeError(
            f"No image returned by {model_id}. Text parts: {text_parts[:2]}"
        )

    def _generate_imagen(
        self,
        prompt: str,
        model_id: str,
        aspect_ratio: Optional[str] = None,
    ) -> bytes:
        """Imagen uses a different API surface (generate_images) — text-only."""
        response = self._client.models.generate_images(
            model=model_id,
            prompt=prompt,
            config=types.GenerateImagesConfig(
                number_of_images=1,
                aspect_ratio=aspect_ratio or "1:1",
            ),
        )
        gens = getattr(response, "generated_images", None) or []
        if not gens:
            raise RuntimeError(f"No images returned by {model_id}.")
        image_obj = gens[0].image
        data = getattr(image_obj, "image_bytes", None)
        if data is None:
            raise RuntimeError(f"No image bytes in response from {model_id}.")
        return data
