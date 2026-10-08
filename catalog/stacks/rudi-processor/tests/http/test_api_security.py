"""Exercise the real ASGI API without invoking document/LLM providers."""
import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

STACK = Path(__file__).resolve().parents[2]
TOKEN = "test-token-" + "a" * 32


class ApiSecurityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.base = self.root / "inbox"
        self.base.mkdir()
        self.index = self.root / "index"
        providers = {}
        for module, name in [("metadata_processor", "MetadataProcessor"),
                             ("stage2_processor", "Stage2Processor"),
                             ("batch_process_full", "BatchProcessor")]:
            stub = types.ModuleType(module)
            setattr(stub, name, MagicMock())
            providers[module] = stub
        spec = importlib.util.spec_from_file_location("tested_api", STACK / "api_server.py")
        self.api = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, providers), patch.dict(os.environ, {
            "RUDI_BASE_DIR": str(self.base), "RUDI_INDEX_DIR": str(self.index),
            "RUDI_PROCESSOR_API_TOKEN": TOKEN,
        }):
            spec.loader.exec_module(self.api)
        self.api.stage1.process_file.return_value = {"original_name": "stored.txt"}
        self.api.stage2.process_metadata.return_value = {"ok": True}
        self.client = TestClient(self.api.app)
        self.auth = {"Authorization": f"Bearer {TOKEN}"}

    def test_upload_rejects_paths_without_overwriting(self):
        target = self.root / "outside.txt"
        target.write_text("keep")
        for name in [str(target), "../../outside.txt", "..\\outside.txt", ".", ".."]:
            with self.subTest(name=name):
                response = self.client.post("/api/upload", headers=self.auth,
                                            files={"file": (name, b"replace", "text/plain")})
                self.assertEqual(response.status_code, 400, response.text)
                self.assertEqual(target.read_text(), "keep")
        self.api.stage1.process_file.assert_not_called()

    def test_api_and_websocket_require_configured_bearer_token(self):
        from starlette.websockets import WebSocketDisconnect
        for method, url in [("get", "/api/stats"), ("get", "/api/search"),
                            ("post", "/api/upload"), ("post", "/api/process/directory"),
                            ("delete", "/api/clear-metadata"), ("get", "/api/file/abc"),
                            ("get", "/api/download/abc"), ("get", "/api/categories")]:
            for headers in [{}, {"Authorization": "Bearer wrong"}]:
                response = getattr(self.client, method)(url, headers=headers)
                self.assertEqual(response.status_code, 401, (method, url, response.text))
        with self.assertRaises(WebSocketDisconnect):
            with self.client.websocket_connect("/ws"):
                self.fail("Unauthenticated websocket accepted")
        with self.client.websocket_connect("/ws", headers=self.auth) as websocket:
            websocket.send_text("hello")
            self.assertEqual(websocket.receive_text(), "Echo: hello")
        self.assertEqual(self.client.get("/api/stats", headers=self.auth).status_code, 200)
        with patch.object(self.api, "API_TOKEN", ""):
            self.assertEqual(self.client.get("/api/stats", headers=self.auth).status_code, 503)
        response = self.client.options("/api/stats", headers={
            "Origin": "https://evil.example", "Access-Control-Request-Method": "GET"})
        self.assertNotIn("access-control-allow-origin", response.headers)

    def test_metadata_download_and_directory_stay_inside_roots(self):
        import json
        external = self.root / "private.txt"
        external.write_text("private")
        stage2 = self.index / "metadata" / "stage1" / "stage2" / "2025-08"
        stage2.mkdir(parents=True)
        file_hash = "a" * 64
        metadata = stage2 / f"{file_hash}.stage2.json"
        metadata.write_text(json.dumps({"file_path": str(external)}))
        response = self.client.get(f"/api/download/{file_hash}", headers=self.auth)
        self.assertEqual(response.status_code, 403, response.text)
        local = self.base / "safe.txt"
        local.write_text("safe")
        metadata.write_text(json.dumps({"file_path": str(local)}))
        self.assertEqual(self.client.get(f"/api/download/{file_hash}", headers=self.auth).text, "safe")
        local.unlink()
        local.symlink_to(external)
        self.assertEqual(self.client.get(f"/api/download/{file_hash}", headers=self.auth).status_code, 403)
        metadata.unlink()
        metadata.symlink_to(external)
        self.assertEqual(self.client.get(f"/api/file/{file_hash}", headers=self.auth).status_code, 403)
        for directory in [self.root, self.base]:
            response = self.client.post("/api/process/directory", params={"directory_path": str(directory)}, headers=self.auth)
            self.assertEqual(response.status_code, 403, response.text)
        self.api.BatchProcessor.assert_not_called()
        self.assertEqual(self.client.get("/api/file/not-a-hash", headers=self.auth).status_code, 400)

    def test_upload_storage_is_opaque_and_never_follows_existing_symlinks(self):
        external = self.root / "private.txt"
        external.write_text("keep")
        planted = self.base / "uploads" / "report.txt"
        planted.symlink_to(external)
        for _ in range(2):
            response = self.client.post("/api/upload", headers=self.auth,
                                       files={"file": ("report.txt", b"contents", "text/plain")})
            self.assertEqual(response.status_code, 200, response.text)
        stored = [Path(call.args[0]) for call in self.api.stage1.process_file.call_args_list]
        self.assertEqual(len(set(stored)), 2)
        self.assertTrue(all(path.name != "report.txt" and path.read_bytes() == b"contents" for path in stored))
        self.assertEqual(external.read_text(), "keep")
        self.assertEqual(self.api.stage2.process_metadata.call_args.args[0]["original_name"], "report.txt")
        for path in stored:
            path.unlink()
        planted.unlink()
        (self.base / "uploads").rmdir()
        (self.base / "uploads").symlink_to(self.root, target_is_directory=True)
        response = self.client.post("/api/upload", headers=self.auth,
                                   files={"file": ("report.txt", b"contents", "text/plain")})
        self.assertEqual(response.status_code, 403, response.text)

    def test_startup_rejects_missing_token_and_ui_assets_are_public(self):
        with patch.object(self.api, "API_TOKEN", ""):
            with self.assertRaisesRegex(RuntimeError, "RUDI_PROCESSOR_API_TOKEN"):
                with TestClient(self.api.app):
                    pass
        with TestClient(self.api.app) as client:
            self.assertIn('id="apiToken"', client.get("/").text)
            self.assertEqual(client.get("/frontend/rudi_search.js").status_code, 200)


if __name__ == "__main__":
    unittest.main()
