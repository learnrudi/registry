"""Replicate image generation client for site-engine.

Provides access to the open-source frontier via Replicate's hosted models:
FLUX.2, FLUX.1.1 Pro, FLUX schnell, Stable Diffusion 3.5, Ideogram v3.

Matches the GeminiClient/OpenAIClient interface so the provider dispatcher
treats them uniformly.

Provider differences (intentionally surfaced, not hidden):
  - Reference-image support varies per model:
      black-forest-labs/flux-2              : up to 10 images (multi-ref)
      black-forest-labs/flux-1.1-pro        : 1 image
      stability-ai/stable-diffusion-3.5-large: 1 image (img2img)
      black-forest-labs/flux-schnell        : none
      ideogram-ai/ideogram-v3               : none
  - Replicate returns either URLs or FileOutput objects; this client
    normalizes both into raw bytes.
"""

from __future__ import annotations

import os
import urllib.request
from pathlib import Path
from typing import Optional, Union

import PIL.Image
from replicate.client import Client

from model_config import (
    DEFAULT_MODELS,
    REPLICATE_ASPECT_RATIO_MODELS,
    REPLICATE_PRESET_ALIASES,
    REPLICATE_REFERENCE_CONFIG,
)

try:
    from .gemini_client import load_env  # type: ignore[import-not-found]
except ImportError:
    from gemini_client import load_env  # type: ignore[import-not-found,no-redef]


DEFAULT_SKETCH_MODEL = DEFAULT_MODELS["replicate"]["sketch"]
DEFAULT_PHOTOREAL_MODEL = DEFAULT_MODELS["replicate"]["photoreal"]
DEFAULT_EDIT_MODEL = DEFAULT_MODELS["replicate"]["edit"]

# Named aliases that map short names -> full Replicate model slugs.
PRESET_ALIASES: dict = REPLICATE_PRESET_ALIASES

# Per-model reference-image config: (input param name, allows list, max count).
# Replicate is beta in this stack because hosted model schemas are model-specific.
REFERENCE_CONFIG: dict = REPLICATE_REFERENCE_CONFIG

ASPECT_RATIO_MODELS = REPLICATE_ASPECT_RATIO_MODELS


class ReplicateClient:
    def __init__(
        self,
        api_token: Optional[str] = None,
        env_path: Optional[Path] = None,
        sketch_model: Optional[str] = None,
        photoreal_model: Optional[str] = None,
        edit_model: Optional[str] = None,
    ) -> None:
        env = load_env(env_path) if env_path else {}
        resolved_token = api_token or os.environ.get("REPLICATE_API_TOKEN") or env.get("REPLICATE_API_TOKEN")
        if not resolved_token:
            raise RuntimeError("REPLICATE_API_TOKEN not found in environment")
        self._client = Client(api_token=resolved_token)
        self.sketch_model = sketch_model or os.environ.get("REPLICATE_MODEL_SKETCH") or env.get("REPLICATE_MODEL_SKETCH", DEFAULT_SKETCH_MODEL)
        self.photoreal_model = photoreal_model or os.environ.get("REPLICATE_MODEL_PHOTOREAL") or env.get("REPLICATE_MODEL_PHOTOREAL", DEFAULT_PHOTOREAL_MODEL)
        self.edit_model = edit_model or os.environ.get("REPLICATE_MODEL_EDIT") or env.get("REPLICATE_MODEL_EDIT", DEFAULT_EDIT_MODEL)

    def resolve_model(self, model: str) -> str:
        if model == "sketch":
            return self.sketch_model
        if model == "photoreal":
            return self.photoreal_model
        if model == "edit":
            return self.edit_model
        return PRESET_ALIASES.get(model, model)

    def generate_image(
        self,
        prompt: str,
        reference: Optional[Union[Path, PIL.Image.Image, list]] = None,
        model: str = "photoreal",
        aspect_ratio: Optional[str] = None,
    ) -> bytes:
        """Generate an image and return raw bytes.

        `reference` may be a single Path/Image or a list (for models that
        accept multi-reference, e.g. FLUX.2).
        """
        model_id = self.resolve_model(model)
        refs = self._normalize_references(reference)

        input_params: dict = {"prompt": prompt}
        if aspect_ratio:
            if model_id not in ASPECT_RATIO_MODELS:
                raise RuntimeError(
                    f"Model {model_id} does not have verified aspect_ratio support."
                )
            input_params["aspect_ratio"] = aspect_ratio

        if refs:
            ref_cfg = REFERENCE_CONFIG.get(model_id)
            if ref_cfg is None:
                raise RuntimeError(
                    f"Model {model_id} does not support reference images. "
                    f"Use preset 'edit' (flux-2), 'photoreal' (flux-1.1-pro), "
                    f"or model 'sd-3.5' instead."
                )
            param_name, allows_list, max_refs = ref_cfg
            if len(refs) > max_refs:
                raise RuntimeError(
                    f"Model {model_id} accepts up to {max_refs} reference images, got {len(refs)}."
                )
            ref_entries = [self._to_file_handle(r) for r in refs]
            ref_handles = [entry[0] for entry in ref_entries]
            temp_paths = [entry[1] for entry in ref_entries if entry[1] is not None]
            if allows_list:
                input_params[param_name] = ref_handles
            else:
                input_params[param_name] = ref_handles[0]
        else:
            ref_handles = []
            temp_paths = []

        try:
            output = self._client.run(model_id, input=input_params)
        except Exception as e:
            raise RuntimeError(f"Replicate call failed for {model_id}: {e}") from e
        finally:
            for handle in ref_handles:
                handle.close()
            for temp_path in temp_paths:
                temp_path.unlink(missing_ok=True)

        return self._extract_bytes(output, model_id)

    @staticmethod
    def _normalize_references(reference) -> list:
        if reference is None:
            return []
        if isinstance(reference, (list, tuple)):
            return list(reference)
        return [reference]

    @staticmethod
    def _to_file_handle(ref):
        if isinstance(ref, Path):
            return open(ref, "rb"), None
        if isinstance(ref, PIL.Image.Image):
            import tempfile
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as file:
                tmp = Path(file.name)
            ref.save(tmp)
            return open(tmp, "rb"), tmp
        raise TypeError(f"Unsupported reference type: {type(ref)!r}")

    @staticmethod
    def _extract_bytes(output, model_id: str) -> bytes:
        if isinstance(output, list):
            if not output:
                raise RuntimeError(f"Empty output list from {model_id}.")
            output = output[0]

        if hasattr(output, "read"):
            return output.read()

        if isinstance(output, str) and output.startswith(("http://", "https://")):
            with urllib.request.urlopen(output, timeout=180) as resp:
                return resp.read()

        raise RuntimeError(
            f"Unexpected output type from {model_id}: {type(output).__name__}"
        )
