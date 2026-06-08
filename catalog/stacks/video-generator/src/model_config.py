"""Provider model catalog, defaults, and status labels."""

from __future__ import annotations


TEXT_MODE = {
    "text": {
        "supported": True,
        "rule": "Prompt-only text-to-video.",
    },
}

GEMINI_31_MODES = {
    **TEXT_MODE,
    "image": {
        "supported": True,
        "rule": "First-frame image-to-video; this stack requires 8 seconds for media-conditioned Gemini/Veo generations.",
    },
    "interpolate": {
        "supported": True,
        "rule": "First-frame plus last-frame interpolation; this stack requires 8 seconds for media-conditioned Gemini/Veo generations.",
    },
    "references": {
        "supported": True,
        "max_references": 3,
        "multi_reference": True,
        "rule": "Reference images guide subject, style, or composition; this stack requires 8 seconds for media-conditioned Gemini/Veo generations.",
    },
    "extend": {
        "supported": True,
        "rule": "Veo extension using a recent Gemini-generated local MP4/WebM with its RUDI metadata sidecar; Gemini requires 8 seconds and a provider video URI from a previous Veo generation.",
    },
}

SINGLE_IMAGE_MODES = {
    **TEXT_MODE,
    "image": {
        "supported": True,
        "rule": "First-frame image-to-video using one local input image.",
    },
    "references": {
        "supported": True,
        "max_references": 1,
        "multi_reference": False,
        "rule": "Model-specific single image input; treated as beta until live-tested.",
    },
}

IMAGE_ONLY_MODES = {
    "image": {
        "supported": True,
        "rule": "Image-to-video using one local input image.",
    },
    "references": {
        "supported": True,
        "max_references": 1,
        "multi_reference": False,
        "rule": "Model-specific single image input; treated as beta until live-tested.",
    },
}

FAL_SEEDANCE_MODES = {
    **TEXT_MODE,
    "image": {
        "supported": True,
        "rule": "First-frame image-to-video using one local input image.",
    },
    "interpolate": {
        "supported": True,
        "rule": "First-frame plus last-frame image-to-video using two local input images.",
    },
    "references": {
        "supported": True,
        "max_references": 3,
        "multi_reference": True,
        "rule": "Reference images mapped to fal Seedance reference-to-video image_urls.",
    },
}


DEFAULT_MODEL_BY_PROVIDER: dict[str, str] = {
    "gemini": "veo-3.1-generate-preview",
    "replicate": "bytedance/seedance-1-pro-fast",
    "fal": "bytedance/seedance-2.0/fast",
    "openai": "sora-2",
}

PROVIDER_CONFIGS: dict[str, dict[str, object]] = {
    "gemini": {
        "label": "Gemini / Veo",
        "rollout_stage": "primary",
        "provider_type": "first_party_api",
        "docs_url": "https://ai.google.dev/gemini-api/docs/video",
        "notes": "Default provider. Add and test Veo models here first.",
    },
    "replicate": {
        "label": "Replicate Hosted Video Models",
        "rollout_stage": "beta",
        "provider_type": "hosted_model_marketplace",
        "docs_url": "https://replicate.com/docs",
        "notes": "Model schemas differ. Each model requires an explicit adapter entry and live smoke test.",
    },
    "fal": {
        "label": "fal Hosted Video Models",
        "rollout_stage": "beta",
        "provider_type": "hosted_model_platform",
        "docs_url": "https://fal.ai/docs/model-api-reference/video-generation-api/overview",
        "notes": "Hosted model platform. Each model endpoint requires explicit mode mapping and live smoke testing.",
    },
    "openai": {
        "label": "OpenAI Sora",
        "rollout_stage": "legacy",
        "provider_type": "first_party_legacy_api",
        "docs_url": "https://platform.openai.com/docs/guides/video-generation",
        "notes": "Optional legacy provider. OpenAI's model catalog currently marks Sora 2 models as deprecated/legacy; do not make default.",
    },
}

MODEL_ALIASES: dict[str, dict[str, str]] = {
    "gemini": {
        "default": DEFAULT_MODEL_BY_PROVIDER["gemini"],
        "veo": "veo-3.1-generate-preview",
        "veo-3.1": "veo-3.1-generate-preview",
        "veo-fast": "veo-3.1-fast-generate-preview",
        "veo-lite": "veo-3.1-lite-generate-preview",
        "veo-3": "veo-3.0-generate-001",
        "veo-3-fast": "veo-3.0-fast-generate-001",
    },
    "replicate": {
        "default": DEFAULT_MODEL_BY_PROVIDER["replicate"],
        "seedance": "bytedance/seedance-1-pro",
        "seedance-fast": "bytedance/seedance-1-pro-fast",
        "minimax": "minimax/video-01",
        "hailuo": "minimax/video-01",
        "kling": "kwaivgi/kling-v2.1",
    },
    "fal": {
        "default": DEFAULT_MODEL_BY_PROVIDER["fal"],
        "seedance-2": "bytedance/seedance-2.0",
        "seedance-2-fast": "bytedance/seedance-2.0/fast",
    },
    "openai": {
        "default": DEFAULT_MODEL_BY_PROVIDER["openai"],
        "sora": "sora-2",
        "sora-pro": "sora-2-pro",
    },
}

KNOWN_MODELS: dict[str, dict[str, dict[str, object]]] = {
    "gemini": {
        "veo-3.1-generate-preview": {
            "label": "Veo 3.1 Preview",
            "status": "current_preview",
            "default": True,
            "formats": ["story", "landscape"],
            "modes": GEMINI_31_MODES,
            "durations": [4, 6, 8],
            "default_duration_seconds": 8,
            "references": {
                "supported": True,
                "max_references": 3,
                "multi_reference": True,
                "rule": "Veo 3.1 accepts up to three asset reference images; reference-image generations must use 8 seconds.",
            },
            "notes": "Default Gemini/Veo model for high-fidelity video with native audio.",
        },
        "veo-3.1-fast-generate-preview": {
            "label": "Veo 3.1 Fast Preview",
            "status": "current_preview",
            "default": False,
            "formats": ["story", "landscape"],
            "modes": GEMINI_31_MODES,
            "durations": [4, 6, 8],
            "default_duration_seconds": 8,
            "references": {
                "supported": True,
                "max_references": 3,
                "multi_reference": True,
                "rule": "Veo 3.1 Fast accepts up to three asset reference images; reference-image generations must use 8 seconds.",
            },
            "notes": "Faster Veo 3.1 preview model for lower-latency iteration.",
        },
        "veo-3.1-lite-generate-preview": {
            "label": "Veo 3.1 Lite Preview",
            "status": "beta_preview",
            "default": False,
            "formats": ["story", "landscape"],
            "modes": TEXT_MODE,
            "durations": [4, 6, 8],
            "default_duration_seconds": 8,
            "references": {
                "supported": False,
                "max_references": 0,
                "multi_reference": False,
                "rule": "Veo 3.1 Lite does not support referenceImages.",
            },
            "notes": "Lower-cost preview model; use explicitly after validating account access.",
        },
        "veo-3.0-generate-001": {
            "label": "Veo 3",
            "status": "stable",
            "default": False,
            "formats": ["story", "landscape"],
            "modes": TEXT_MODE,
            "durations": [4, 6, 8],
            "default_duration_seconds": 8,
            "references": {
                "supported": False,
                "max_references": 0,
                "multi_reference": False,
                "rule": "This stack only maps normalized references to Veo 3.1 referenceImages.",
            },
            "notes": "Stable Veo 3 model.",
        },
        "veo-3.0-fast-generate-001": {
            "label": "Veo 3 Fast",
            "status": "stable",
            "default": False,
            "formats": ["story", "landscape"],
            "modes": TEXT_MODE,
            "durations": [4, 6, 8],
            "default_duration_seconds": 8,
            "references": {
                "supported": False,
                "max_references": 0,
                "multi_reference": False,
                "rule": "This stack only maps normalized references to Veo 3.1 referenceImages.",
            },
            "notes": "Stable faster Veo 3 model.",
        },
    },
    "replicate": {
        "bytedance/seedance-1-pro-fast": {
            "label": "Seedance 1 Pro Fast",
            "status": "beta_hosted",
            "default": True,
            "formats": ["story", "landscape"],
            "modes": SINGLE_IMAGE_MODES,
            "durations": [5, 10],
            "default_duration_seconds": 5,
            "references": {
                "supported": True,
                "max_references": 1,
                "multi_reference": False,
                "rule": "Replicate support is model-specific; this adapter maps the first reference to image-to-video input. Seedance ignores aspect_ratio when image is supplied; use a source image with the desired shape.",
            },
            "source_image_format_policy": {
                "modes": ["image", "references"],
                "tolerance": 0.04,
                "rule": "Seedance image-to-video output follows the input image aspect ratio.",
            },
            "notes": "Hosted Replicate video model for text-to-video and image-to-video. Live-smoked for text and vertical image-to-video on 2026-05-17; remains beta_hosted because the schema is model-specific.",
        },
        "bytedance/seedance-1-pro": {
            "label": "Seedance 1 Pro",
            "status": "beta_hosted",
            "default": False,
            "formats": ["story", "landscape"],
            "modes": SINGLE_IMAGE_MODES,
            "durations": [5, 10],
            "default_duration_seconds": 5,
            "references": {
                "supported": True,
                "max_references": 1,
                "multi_reference": False,
                "rule": "Replicate support is model-specific; this adapter maps the first reference to image-to-video input. Seedance ignores aspect_ratio when image is supplied; use a source image with the desired shape.",
            },
            "source_image_format_policy": {
                "modes": ["image", "references"],
                "tolerance": 0.04,
                "rule": "Seedance image-to-video output follows the input image aspect ratio.",
            },
            "notes": "Hosted Replicate model with text-to-video and image-to-video support. Live-smoked for text-to-video on 2026-05-17; remains beta_hosted because the schema is model-specific.",
        },
        "minimax/video-01": {
            "label": "MiniMax Video-01",
            "status": "beta_hosted",
            "default": False,
            "formats": ["landscape"],
            "modes": SINGLE_IMAGE_MODES,
            "durations": [6],
            "default_duration_seconds": 6,
            "references": {
                "supported": True,
                "max_references": 1,
                "multi_reference": False,
                "rule": "Replicate support is model-specific; this adapter maps the first reference to prompt image input.",
            },
            "source_image_format_policy": {
                "modes": ["image", "references"],
                "tolerance": 0.04,
                "rule": "MiniMax image-to-video output follows the first-frame image aspect ratio.",
            },
            "notes": "Hosted Hailuo/MiniMax video model. Live-smoked for landscape text-to-video on 2026-05-17. Current Replicate schema has no text-to-video aspect-ratio control; expose landscape only until mode-specific format validation is added.",
        },
        "kwaivgi/kling-v2.1": {
            "label": "Kling v2.1",
            "status": "beta_hosted",
            "default": False,
            "formats": ["story", "landscape"],
            "modes": IMAGE_ONLY_MODES,
            "durations": [5, 10],
            "default_duration_seconds": 5,
            "references": {
                "supported": True,
                "max_references": 1,
                "multi_reference": False,
                "rule": "Kling v2.1 on Replicate is image-to-video; one start image is required and output shape follows the source image.",
            },
            "source_image_format_policy": {
                "modes": ["image", "references"],
                "tolerance": 0.04,
                "rule": "Kling image-to-video output follows the start image aspect ratio.",
            },
            "requires_reference": True,
            "notes": "Hosted Replicate image-to-video model. Live-smoked with a vertical start image on 2026-05-17; remains beta_hosted because the schema is model-specific.",
        },
    },
    "fal": {
        "bytedance/seedance-2.0/fast": {
            "label": "Seedance 2.0 Fast",
            "status": "beta_hosted",
            "default": True,
            "formats": ["story", "landscape"],
            "modes": FAL_SEEDANCE_MODES,
            "durations": [4, 5, 6, 8, 10, 12],
            "default_duration_seconds": 5,
            "references": {
                "supported": True,
                "max_references": 3,
                "multi_reference": True,
                "rule": "fal Seedance reference-to-video accepts image reference URLs; this stack uploads local references and maps them to image_urls.",
            },
            "notes": "fal-hosted Seedance 2.0 fast endpoints for text, image, first/last-frame interpolation, and image references. Live-smoked for all exposed modes on 2026-05-18; remains beta_hosted because fal is a hosted model platform with mode-specific endpoint schemas.",
        },
        "bytedance/seedance-2.0": {
            "label": "Seedance 2.0",
            "status": "beta_hosted",
            "default": False,
            "formats": ["story", "landscape"],
            "modes": FAL_SEEDANCE_MODES,
            "durations": [4, 5, 6, 8, 10, 12],
            "default_duration_seconds": 5,
            "references": {
                "supported": True,
                "max_references": 3,
                "multi_reference": True,
                "rule": "fal Seedance reference-to-video accepts image reference URLs; this stack uploads local references and maps them to image_urls.",
            },
            "notes": "fal-hosted Seedance 2.0 standard endpoints. Exposed as beta_hosted until text, image, interpolation, and references are live-smoked through this stack.",
        },
    },
    "openai": {
        "sora-2": {
            "label": "Sora 2",
            "status": "legacy_deprecated",
            "default": True,
            "formats": ["story", "landscape"],
            "modes": SINGLE_IMAGE_MODES,
            "durations": [4, 8, 12],
            "default_duration_seconds": 4,
            "references": {
                "supported": True,
                "max_references": 1,
                "multi_reference": False,
                "rule": "OpenAI Videos API accepts one input reference image.",
            },
            "notes": "OpenAI video model kept for explicit experiments only because the model catalog currently marks Sora 2 as deprecated.",
        },
        "sora-2-pro": {
            "label": "Sora 2 Pro",
            "status": "legacy_deprecated",
            "default": False,
            "formats": ["story", "landscape"],
            "modes": SINGLE_IMAGE_MODES,
            "durations": [4, 8, 12],
            "default_duration_seconds": 4,
            "references": {
                "supported": True,
                "max_references": 1,
                "multi_reference": False,
                "rule": "OpenAI Videos API accepts one input reference image.",
            },
            "notes": "Higher-quality Sora model kept for explicit experiments only because the model catalog currently marks Sora 2 Pro as legacy/deprecated.",
        },
    },
}
