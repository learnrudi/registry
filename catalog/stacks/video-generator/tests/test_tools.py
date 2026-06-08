from __future__ import annotations

import asyncio
import os
import sys
import tempfile
import unittest
import uuid
from contextlib import contextmanager
from io import BytesIO
from pathlib import Path
from unittest import mock

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

import tools as tool_module  # noqa: E402
from constants import DEFAULT_OUTPUT_DIR  # noqa: E402
from errors import ToolError  # noqa: E402
from jobs import VideoJob, poll_video_job  # noqa: E402
from model_registry import list_video_models  # noqa: E402
from outputs import (  # noqa: E402
    output_metadata_path,
    output_path,
    read_output_metadata,
    validate_video_bytes,
    write_output_metadata,
)
from renderer.fal_client import FalVideoClient  # noqa: E402
from renderer.gemini_client import GeminiVideoClient  # noqa: E402
from renderer.replicate_client import ReplicateVideoClient  # noqa: E402
from tools import generate_video, get_video_job  # noqa: E402
from validation import normalize_references, normalize_video_inputs, read_prompt  # noqa: E402


def png_bytes(size: tuple[int, int] = (2, 2)) -> bytes:
    buffer = BytesIO()
    Image.new("RGB", size, "white").save(buffer, format="PNG")
    return buffer.getvalue()


def mp4_bytes() -> bytes:
    return b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom\x00\x00\x00\x08mdat"


def cleanup_output(path: Path) -> None:
    path.unlink(missing_ok=True)
    output_metadata_path(path).unlink(missing_ok=True)


@contextmanager
def without_env(*names: str):
    previous = {name: os.environ.get(name) for name in names}
    for name in names:
        os.environ.pop(name, None)
    try:
        yield
    finally:
        for name, value in previous.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value


class FakeProvider:
    provider = "gemini"

    def submit_video(self, **kwargs):
        self.kwargs = kwargs
        return VideoJob(provider="gemini", job_id="job-1", status="completed", done=True)

    def get_job(self, job_id: str):
        return VideoJob(provider="gemini", job_id=job_id, status="completed", done=True)

    def download_video(self, job: VideoJob):
        return mp4_bytes()

    def video_metadata(self, job: VideoJob):
        return {"test_video_uri": f"provider://{job.job_id}", "mime_type": "video/mp4"}


class LifecycleProvider:
    def __init__(self, provider: str, submit_job: VideoJob, poll_jobs: list[VideoJob] | None = None) -> None:
        self.provider = provider
        self.submit_job = submit_job
        self.poll_jobs = list(poll_jobs or [])
        self.submitted: dict | None = None

    def submit_video(self, **kwargs):
        self.submitted = kwargs
        return self.submit_job

    def get_job(self, job_id: str):
        if self.poll_jobs:
            return self.poll_jobs.pop(0)
        return VideoJob(provider=self.provider, job_id=job_id, status="in_progress", done=False)

    def download_video(self, job: VideoJob):
        return mp4_bytes()

    def video_metadata(self, job: VideoJob):
        return {"test_video_uri": f"provider://{job.job_id}", "mime_type": "video/mp4"}


PROVIDER_CASES = {
    "gemini": {"duration_seconds": 8},
    "replicate": {"duration_seconds": 5},
    "fal": {"duration_seconds": 5},
    "openai": {"duration_seconds": 4},
}


def video_request(provider: str, out_path: Path, **overrides):
    request = {
        "provider": provider,
        "prompt": "A short product reveal.",
        "format": "story",
        "duration_seconds": PROVIDER_CASES[provider]["duration_seconds"],
        "out_path": str(out_path),
    }
    request.update(overrides)
    return request


class VideoGeneratorToolsTest(unittest.TestCase):
    def test_prompt_paths_are_literal_text(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            prompt_file = Path(tmp) / "prompt.txt"
            prompt_file.write_text("file contents should not be read", encoding="utf-8")

            prompt, label = read_prompt(str(prompt_file))

        self.assertEqual(prompt, str(prompt_file))
        self.assertIn("literal prompt", label)

    def test_references_must_be_real_images(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fake_png = Path(tmp) / "not-an-image.png"
            fake_png.write_text("not image bytes", encoding="utf-8")

            with self.assertRaises(ToolError) as raised:
                normalize_references({"references": [str(fake_png)]})

        self.assertEqual(raised.exception.error_kind, "validation")

    def test_valid_png_reference_is_accepted(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            png_path = Path(tmp) / "reference.png"
            png_path.write_bytes(png_bytes())

            refs = normalize_references({"references": [str(png_path)]})

        self.assertEqual(len(refs), 1)
        self.assertEqual(refs[0].name, "reference.png")

    def test_video_inputs_infer_references_mode(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            png_path = Path(tmp) / "reference.png"
            png_path.write_bytes(png_bytes())

            inputs = normalize_video_inputs({"references": [str(png_path)]})

        self.assertEqual(inputs.mode, "references")
        self.assertEqual(len(inputs.references), 1)

    def test_video_inputs_require_mode_specific_fields(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            png_path = Path(tmp) / "frame.png"
            png_path.write_bytes(png_bytes())

            with self.assertRaises(ToolError) as raised:
                normalize_video_inputs({"mode": "text", "input_image": str(png_path)})

        self.assertEqual(raised.exception.error_kind, "validation")
        self.assertEqual(raised.exception.details["field"], "mode")

    def test_video_inputs_support_source_video_extension_mode(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "source.mp4"
            source.write_bytes(mp4_bytes())

            inputs = normalize_video_inputs({"source_video": str(source)})

        self.assertEqual(inputs.mode, "extend")
        self.assertEqual(inputs.source_video.name, "source.mp4")

    def test_interpolate_mode_requires_first_and_last_frames(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            first = Path(tmp) / "first.png"
            first.write_bytes(png_bytes())

            with self.assertRaises(ToolError) as raised:
                normalize_video_inputs({"mode": "interpolate", "input_image": str(first)})

        self.assertEqual(raised.exception.error_kind, "validation")
        self.assertEqual(raised.exception.details["field"], "mode")

    def test_output_path_must_stay_inside_rudi_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            outside_path = Path(tmp) / "video.mp4"

            with self.assertRaises(ToolError) as raised:
                output_path(str(outside_path))

        self.assertEqual(raised.exception.error_kind, "validation")
        self.assertIn(str(DEFAULT_OUTPUT_DIR), raised.exception.message)

    def test_existing_output_path_is_not_overwritten(self) -> None:
        out_path = DEFAULT_OUTPUT_DIR / f"video-generator-existing-{uuid.uuid4().hex}.mp4"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(mp4_bytes())
        try:
            with self.assertRaises(ToolError) as raised:
                output_path(str(out_path))

            self.assertEqual(raised.exception.error_kind, "validation")
            self.assertEqual(raised.exception.details["field"], "out_path")
        finally:
            cleanup_output(out_path)

    def test_validate_video_bytes_accepts_mp4(self) -> None:
        self.assertEqual(validate_video_bytes(mp4_bytes(), "gemini", "veo"), "mp4")

    def test_list_video_models_reports_defaults_and_secret_status(self) -> None:
        with mock.patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}, clear=False):
            models = list_video_models({})

        self.assertTrue(models["ok"])
        self.assertEqual(
            models["providers"]["gemini"]["default_model"],
            "veo-3.1-generate-preview",
        )
        self.assertEqual(
            models["providers"]["replicate"]["models"]["bytedance/seedance-1-pro-fast"]["status"],
            "beta_hosted",
        )
        self.assertEqual(
            models["providers"]["fal"]["models"]["bytedance/seedance-2.0/fast"]["status"],
            "beta_hosted",
        )
        self.assertIn("image", models["providers"]["gemini"]["models"]["veo-3.1-generate-preview"]["modes"])
        self.assertIn("extend", models["providers"]["gemini"]["models"]["veo-3.1-generate-preview"]["modes"])
        self.assertEqual(models["providers"]["fal"]["secret_status"]["env"], "FAL_KEY")
        self.assertTrue(models["providers"]["gemini"]["secret_status"]["configured"])

    def test_openai_sora_catalog_entry_stays_legacy(self) -> None:
        models = list_video_models({})

        self.assertEqual(models["providers"]["openai"]["rollout_stage"], "legacy")
        self.assertEqual(
            models["providers"]["openai"]["models"]["sora-2"]["status"],
            "legacy_deprecated",
        )

    def test_list_video_models_response_shape_snapshot(self) -> None:
        models = list_video_models({})
        summary = {
            "top_level": sorted(models),
            "formats": {
                format_id: sorted(format_data)
                for format_id, format_data in models["formats"].items()
            },
            "providers": {
                provider: {
                    "keys": sorted(provider_data),
                    "model_keys": sorted(next(iter(provider_data["models"].values()))),
                    "secret_status_keys": sorted(provider_data["secret_status"]),
                }
                for provider, provider_data in models["providers"].items()
            },
        }

        self.assertEqual(summary["top_level"], ["formats", "ok", "providers", "timeout_seconds"])
        self.assertEqual(
            summary["formats"],
            {
                "landscape": ["aspect_ratio", "description"],
                "story": ["aspect_ratio", "description"],
            },
        )
        for provider in ("fal", "gemini", "openai", "replicate"):
            self.assertIn(provider, summary["providers"])
            self.assertIn("models", summary["providers"][provider]["keys"])
            self.assertIn("configured", summary["providers"][provider]["secret_status_keys"])

    def test_generate_video_reports_missing_secret(self) -> None:
        with without_env("GEMINI_API_KEY"):
            with self.assertRaises(ToolError) as raised:
                asyncio.run(
                    generate_video(
                        {
                            "provider": "gemini",
                            "prompt": "A short product reveal.",
                        }
                    )
                )

        self.assertEqual(raised.exception.error_kind, "missing_secret")
        self.assertEqual(raised.exception.details["secret_name"], "GEMINI_API_KEY")

    def test_generate_video_writes_valid_output_with_fake_provider(self) -> None:
        out_path = DEFAULT_OUTPUT_DIR / f"video-generator-test-{uuid.uuid4().hex}.mp4"
        try:
            with mock.patch.object(tool_module, "build_provider", return_value=FakeProvider()):
                result = asyncio.run(
                    generate_video(
                        {
                            "provider": "gemini",
                            "prompt": "A short product reveal.",
                            "format": "story",
                            "duration_seconds": 8,
                            "out_path": str(out_path),
                        }
                    )
                )

            self.assertTrue(result["ok"])
            self.assertEqual(result["out_path"], str(out_path))
            self.assertEqual(result["video_format"], "mp4")
            self.assertEqual(result["mode"], "text")
            self.assertTrue(out_path.exists())
            self.assertTrue(output_metadata_path(out_path).exists())
            metadata = read_output_metadata(out_path)
            self.assertEqual(metadata["provider"], "gemini")
            self.assertEqual(metadata["job_id"], "job-1")
            self.assertEqual(metadata["provider_artifact"]["mime_type"], "video/mp4")
        finally:
            cleanup_output(out_path)

    def test_generate_video_passes_image_mode_to_provider(self) -> None:
        out_path = DEFAULT_OUTPUT_DIR / f"video-generator-image-{uuid.uuid4().hex}.mp4"
        with tempfile.TemporaryDirectory() as tmp:
            first = Path(tmp) / "first.png"
            first.write_bytes(png_bytes())
            fake = FakeProvider()
            try:
                with mock.patch.object(tool_module, "build_provider", return_value=fake):
                    result = asyncio.run(
                        generate_video(
                            {
                                "provider": "gemini",
                                "prompt": "Animate this product frame.",
                                "mode": "image",
                                "input_image": str(first),
                                "format": "story",
                                "duration_seconds": 8,
                                "out_path": str(out_path),
                            }
                        )
                    )

                self.assertTrue(result["ok"])
                self.assertEqual(result["mode"], "image")
                self.assertEqual(fake.kwargs["mode"], "image")
                self.assertEqual(fake.kwargs["input_image"], first.resolve())
                self.assertTrue(out_path.exists())
            finally:
                cleanup_output(out_path)

    def test_gemini_media_modes_require_eight_seconds(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            first = Path(tmp) / "first.png"
            first.write_bytes(png_bytes())

            with self.assertRaises(ToolError) as raised:
                asyncio.run(
                    generate_video(
                        {
                            "provider": "gemini",
                            "prompt": "Animate this product frame.",
                            "mode": "image",
                            "input_image": str(first),
                            "duration_seconds": 4,
                        }
                    )
                )

        self.assertEqual(raised.exception.error_kind, "unsupported_combo")
        self.assertEqual(raised.exception.details["required_value"], 8)

    def test_gemini_extend_requires_eight_seconds(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "source.mp4"
            source.write_bytes(mp4_bytes())

            with self.assertRaises(ToolError) as raised:
                asyncio.run(
                    generate_video(
                        {
                            "provider": "gemini",
                            "prompt": "Extend this shot.",
                            "mode": "extend",
                            "source_video": str(source),
                            "duration_seconds": 4,
                        }
                    )
                )

        self.assertEqual(raised.exception.error_kind, "unsupported_combo")
        self.assertEqual(raised.exception.details["mode"], "extend")
        self.assertEqual(raised.exception.details["required_value"], 8)

    def test_gemini_extend_source_uses_metadata_sidecar_uri(self) -> None:
        source = DEFAULT_OUTPUT_DIR / f"video-generator-source-{uuid.uuid4().hex}.mp4"
        source.parent.mkdir(parents=True, exist_ok=True)
        source.write_bytes(mp4_bytes())
        try:
            write_output_metadata(
                source,
                provider="gemini",
                model_id="veo-3.1-generate-preview",
                job_id="job-1",
                mode="text",
                asset_format="story",
                video_format="mp4",
                byte_count=len(mp4_bytes()),
                provider_metadata={
                    "gemini_video_uri": "https://example.test/generated-video",
                    "mime_type": "video/mp4",
                },
            )
            client = GeminiVideoClient.__new__(GeminiVideoClient)

            video = client._video_from_output(source)

            self.assertEqual(video.uri, "https://example.test/generated-video")
            self.assertIsNone(video.mime_type)
        finally:
            cleanup_output(source)

    def test_gemini_extend_rejects_source_without_metadata_sidecar(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "source.mp4"
            source.write_bytes(mp4_bytes())
            client = GeminiVideoClient.__new__(GeminiVideoClient)

            with self.assertRaises(ToolError) as raised:
                client._video_from_output(source)

        self.assertEqual(raised.exception.error_kind, "validation")
        self.assertEqual(raised.exception.details["field"], "source_video")

    def test_replicate_seedance_payload_uses_current_schema_fields(self) -> None:
        client = ReplicateVideoClient.__new__(ReplicateVideoClient)
        image_handle = object()

        payload = client._input_for_model(
            "bytedance/seedance-1-pro-fast",
            mode="image",
            prompt="Animate this frame.",
            references=[image_handle],
            aspect_ratio="9:16",
            duration_seconds=5,
        )

        self.assertEqual(payload["prompt"], "Animate this frame.")
        self.assertEqual(payload["duration"], 5)
        self.assertEqual(payload["aspect_ratio"], "9:16")
        self.assertEqual(payload["resolution"], "1080p")
        self.assertIs(payload["image"], image_handle)

    def test_replicate_kling_payload_omits_seedance_only_fields(self) -> None:
        client = ReplicateVideoClient.__new__(ReplicateVideoClient)
        image_handle = object()

        payload = client._input_for_model(
            "kwaivgi/kling-v2.1",
            mode="image",
            prompt="Animate this frame.",
            references=[image_handle],
            aspect_ratio="9:16",
            duration_seconds=5,
        )

        self.assertEqual(payload["prompt"], "Animate this frame.")
        self.assertEqual(payload["duration"], 5)
        self.assertEqual(payload["mode"], "standard")
        self.assertIs(payload["start_image"], image_handle)
        self.assertNotIn("aspect_ratio", payload)
        self.assertNotIn("resolution", payload)

    def test_replicate_minimax_payload_omits_unsupported_duration(self) -> None:
        client = ReplicateVideoClient.__new__(ReplicateVideoClient)
        image_handle = object()

        payload = client._input_for_model(
            "minimax/video-01",
            mode="image",
            prompt="Animate this frame.",
            references=[image_handle],
            aspect_ratio="9:16",
            duration_seconds=6,
        )

        self.assertEqual(payload["prompt"], "Animate this frame.")
        self.assertIs(payload["first_frame_image"], image_handle)
        self.assertNotIn("duration", payload)
        self.assertNotIn("aspect_ratio", payload)

    def test_replicate_minimax_story_format_is_rejected(self) -> None:
        with self.assertRaises(ToolError) as raised:
            asyncio.run(
                generate_video(
                    {
                        "provider": "replicate",
                        "model": "minimax",
                        "prompt": "A short product reveal.",
                        "format": "story",
                        "duration_seconds": 6,
                    }
                )
            )

        self.assertEqual(raised.exception.error_kind, "unsupported_combo")
        self.assertEqual(raised.exception.details["field"], "format")
        self.assertEqual(raised.exception.details["allowed"], ["landscape"])

    def test_fal_seedance_fast_maps_modes_to_current_endpoints(self) -> None:
        client = FalVideoClient.__new__(FalVideoClient)

        self.assertEqual(
            client._endpoint_for_model_mode("bytedance/seedance-2.0/fast", "text"),
            "bytedance/seedance-2.0/fast/text-to-video",
        )
        self.assertEqual(
            client._endpoint_for_model_mode("bytedance/seedance-2.0/fast", "image"),
            "bytedance/seedance-2.0/fast/image-to-video",
        )
        self.assertEqual(
            client._endpoint_for_model_mode("bytedance/seedance-2.0/fast", "interpolate"),
            "bytedance/seedance-2.0/fast/image-to-video",
        )
        self.assertEqual(
            client._endpoint_for_model_mode("bytedance/seedance-2.0/fast", "references"),
            "bytedance/seedance-2.0/fast/reference-to-video",
        )

    def test_fal_payloads_use_current_seedance_schema_fields(self) -> None:
        client = FalVideoClient.__new__(FalVideoClient)

        text_payload = client._input_for_mode(
            mode="text",
            prompt="A short product reveal.",
            image_url=None,
            end_image_url=None,
            image_urls=[],
            aspect_ratio="9:16",
            duration_seconds=5,
        )
        image_payload = client._input_for_mode(
            mode="image",
            prompt="Animate this frame.",
            image_url="https://example.test/first.png",
            end_image_url=None,
            image_urls=[],
            aspect_ratio="16:9",
            duration_seconds=8,
        )
        interpolation_payload = client._input_for_mode(
            mode="interpolate",
            prompt="Transition between frames.",
            image_url="https://example.test/first.png",
            end_image_url="https://example.test/last.png",
            image_urls=[],
            aspect_ratio="9:16",
            duration_seconds=6,
        )
        references_payload = client._input_for_mode(
            mode="references",
            prompt="Use @Image1 for the product.",
            image_url=None,
            end_image_url=None,
            image_urls=["https://example.test/reference.png"],
            aspect_ratio="9:16",
            duration_seconds=10,
        )

        self.assertEqual(text_payload["duration"], "5")
        self.assertEqual(text_payload["resolution"], "720p")
        self.assertEqual(text_payload["aspect_ratio"], "9:16")
        self.assertTrue(text_payload["generate_audio"])
        self.assertEqual(image_payload["image_url"], "https://example.test/first.png")
        self.assertEqual(interpolation_payload["end_image_url"], "https://example.test/last.png")
        self.assertEqual(references_payload["image_urls"], ["https://example.test/reference.png"])

    def test_replicate_seedance_story_rejects_square_input_image_before_provider(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            square = Path(tmp) / "square.png"
            square.write_bytes(png_bytes((64, 64)))

            with mock.patch.object(tool_module, "build_provider") as build_provider:
                with self.assertRaises(ToolError) as raised:
                    asyncio.run(
                        generate_video(
                            {
                                "provider": "replicate",
                                "model": "seedance-fast",
                                "prompt": "Animate this square frame.",
                                "mode": "image",
                                "input_image": str(square),
                                "format": "story",
                                "duration_seconds": 5,
                            }
                        )
                    )

        self.assertEqual(raised.exception.error_kind, "unsupported_combo")
        self.assertEqual(raised.exception.details["field"], "input_image")
        self.assertEqual(raised.exception.details["expected_aspect_ratio"], "9:16")
        build_provider.assert_not_called()

    def test_replicate_seedance_story_accepts_vertical_input_image(self) -> None:
        out_path = DEFAULT_OUTPUT_DIR / f"video-generator-seedance-{uuid.uuid4().hex}.mp4"
        with tempfile.TemporaryDirectory() as tmp:
            vertical = Path(tmp) / "vertical.png"
            vertical.write_bytes(png_bytes((9, 16)))
            fake = LifecycleProvider(
                "replicate",
                submit_job=VideoJob(
                    provider="replicate",
                    job_id="replicate-job",
                    status="completed",
                    done=True,
                ),
            )
            try:
                with mock.patch.object(tool_module, "build_provider", return_value=fake):
                    result = asyncio.run(
                        generate_video(
                            {
                                "provider": "replicate",
                                "model": "seedance-fast",
                                "prompt": "Animate this vertical frame.",
                                "mode": "image",
                                "input_image": str(vertical),
                                "format": "story",
                                "duration_seconds": 5,
                                "out_path": str(out_path),
                            }
                        )
                    )

                self.assertTrue(result["ok"])
                self.assertEqual(result["asset_format"], "story")
                self.assertEqual(result["aspect_ratio"], "9:16")
                self.assertEqual(fake.submitted["input_image"], vertical.resolve())
            finally:
                cleanup_output(out_path)

    def test_get_video_job_pending_does_not_write_output(self) -> None:
        class PendingProvider(FakeProvider):
            def get_job(self, job_id: str):
                return VideoJob(provider="gemini", job_id=job_id, status="in_progress", done=False)

        with mock.patch.object(tool_module, "build_provider", return_value=PendingProvider()):
            result = asyncio.run(
                get_video_job({"provider": "gemini", "job_id": "job-1"})
            )

        self.assertTrue(result["ok"])
        self.assertFalse(result["completed"])
        self.assertEqual(result["status"], "in_progress")

    def test_get_video_job_completed_writes_output(self) -> None:
        out_path = DEFAULT_OUTPUT_DIR / f"video-generator-job-test-{uuid.uuid4().hex}.mp4"
        try:
            with mock.patch.object(tool_module, "build_provider", return_value=FakeProvider()):
                result = asyncio.run(
                    get_video_job(
                        {
                            "provider": "gemini",
                            "job_id": "job-1",
                            "out_path": str(out_path),
                        }
                    )
                )

            self.assertTrue(result["ok"])
            self.assertTrue(result["completed"])
            self.assertEqual(result["out_path"], str(out_path))
            self.assertEqual(result["metadata_path"], str(output_metadata_path(out_path)))
            self.assertTrue(out_path.exists())
        finally:
            cleanup_output(out_path)

    def test_generate_video_completes_for_each_provider_with_fake_lifecycle(self) -> None:
        for provider in PROVIDER_CASES:
            with self.subTest(provider=provider):
                out_path = DEFAULT_OUTPUT_DIR / f"video-generator-{provider}-{uuid.uuid4().hex}.mp4"
                fake = LifecycleProvider(
                    provider,
                    submit_job=VideoJob(
                        provider=provider,
                        job_id=f"{provider}-job",
                        status="completed",
                        done=True,
                    ),
                )
                try:
                    with mock.patch.object(tool_module, "build_provider", return_value=fake):
                        result = asyncio.run(generate_video(video_request(provider, out_path)))

                    self.assertTrue(result["ok"])
                    self.assertEqual(result["provider"], provider)
                    self.assertEqual(result["job_id"], f"{provider}-job")
                    self.assertEqual(result["video_format"], "mp4")
                    self.assertTrue(out_path.exists())
                    self.assertIsNotNone(fake.submitted)
                finally:
                    cleanup_output(out_path)

    def test_get_video_job_pending_for_each_provider_with_fake_lifecycle(self) -> None:
        for provider in PROVIDER_CASES:
            with self.subTest(provider=provider):
                fake = LifecycleProvider(
                    provider,
                    submit_job=VideoJob(provider=provider, job_id=f"{provider}-job", status="queued", done=False),
                    poll_jobs=[
                        VideoJob(provider=provider, job_id=f"{provider}-job", status="in_progress", done=False)
                    ],
                )
                with mock.patch.object(tool_module, "build_provider", return_value=fake):
                    result = asyncio.run(
                        get_video_job({"provider": provider, "job_id": f"{provider}-job"})
                    )

                self.assertTrue(result["ok"])
                self.assertEqual(result["provider"], provider)
                self.assertEqual(result["status"], "in_progress")
                self.assertFalse(result["completed"])

    def test_provider_failed_jobs_return_provider_error_for_each_provider(self) -> None:
        for provider in PROVIDER_CASES:
            with self.subTest(provider=provider):
                out_path = DEFAULT_OUTPUT_DIR / f"video-generator-failed-{provider}-{uuid.uuid4().hex}.mp4"
                fake = LifecycleProvider(
                    provider,
                    submit_job=VideoJob(
                        provider=provider,
                        job_id=f"{provider}-job",
                        status="failed",
                        done=True,
                        error={"message": "provider rejected prompt"},
                    ),
                )
                try:
                    with mock.patch.object(tool_module, "build_provider", return_value=fake):
                        with self.assertRaises(ToolError) as raised:
                            asyncio.run(generate_video(video_request(provider, out_path)))

                    self.assertEqual(raised.exception.error_kind, "provider_error")
                    self.assertEqual(raised.exception.details["provider"], provider)
                    self.assertFalse(out_path.exists())
                finally:
                    cleanup_output(out_path)

    def test_poll_timeout_returns_resumable_job_for_each_provider(self) -> None:
        for provider in PROVIDER_CASES:
            with self.subTest(provider=provider):
                fake = LifecycleProvider(
                    provider,
                    submit_job=VideoJob(provider=provider, job_id=f"{provider}-job", status="queued", done=False),
                )
                with self.assertRaises(ToolError) as raised:
                    asyncio.run(
                        poll_video_job(
                            fake,
                            fake.submit_job,
                            timeout_seconds=0,
                            poll_interval_seconds=0,
                        )
                    )

                self.assertEqual(raised.exception.error_kind, "timeout")
                self.assertEqual(raised.exception.details["provider"], provider)
                self.assertEqual(raised.exception.details["job_id"], f"{provider}-job")


if __name__ == "__main__":
    unittest.main()
