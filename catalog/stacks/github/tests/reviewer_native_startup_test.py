"""Opt-in real CLI handshake: empty auth home, no model turn or repository input."""
import importlib.util
import json
import os
from pathlib import Path
import selectors
import socket
import stat
import subprocess
import sys
import tempfile
import time
import unittest
import uuid

spec = importlib.util.spec_from_file_location("reviewer_host", Path(__file__).parents[1] / "deploy/reviewer_host.py")
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)


@unittest.skipUnless(sys.platform == "darwin" and os.environ.get("RUDI_REVIEWER_TEST_CODEX"),
                     "Set RUDI_REVIEWER_TEST_CODEX to a trusted CLI 0.151.0 binary on macOS")
class NativeStartupTests(unittest.TestCase):
    def test_network_worker_can_resolve_but_cannot_use_arbitrary_local_sockets(self):
        # Confirm the host's DNS before attributing a failure to confinement.
        self.assertTrue(socket.getaddrinfo('chatgpt.com', 443, type=socket.SOCK_STREAM))
        program = str(Path(sys.executable).resolve())
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw).resolve()
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as listener:
                listener.bind(str(root / 'other.sock')); listener.listen(1)
                script = '''import socket,json,sys,os
result={}
try: result['dns']=bool(socket.getaddrinfo('chatgpt.com',443,type=socket.SOCK_STREAM))
except OSError: result['dns']=False
with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as s:
 try: s.connect(sys.argv[1]);result['localDenied']=False
 except PermissionError: result['localDenied']=True
try:
 pid=os.fork()
 if pid==0: os._exit(0)
 os.waitpid(pid,0);result['forkDenied']=False
except PermissionError: result['forkDenied']=True
try: os.execv('/bin/sh',['sh','-c','exit 91'])
except PermissionError: result['execDenied']=True
print(json.dumps(result))'''
                for network in (True, False):
                    with self.subTest(network=network):
                        profile = host.sandbox_profile(program, [sys.base_prefix, str(Path(program).parents[1]), str(root)], [], network=network)
                        result = subprocess.run(['/usr/bin/sandbox-exec', '-p', profile, program, '-I', '-B', '-c', script, str(root / 'other.sock')],
                                                env={'PATH': '/usr/bin:/bin'}, capture_output=True, timeout=15)
                        self.assertEqual(result.returncode, 0, result.stderr.decode())
                        self.assertEqual(json.loads(result.stdout), {'dns': network, 'localDenied': True, 'forkDenied': True, 'execDenied': True})

    def test_credential_free_session_has_expected_profile_without_warnings(self):
        executable = str(Path(os.environ["RUDI_REVIEWER_TEST_CODEX"]).resolve(strict=True))
        version = subprocess.check_output([executable, "--version"], timeout=5, env={"PATH": "/usr/bin:/bin"})
        self.assertEqual(version.strip(), b"codex-cli 0.151.0")
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw).resolve()
            home, working = root / "code", root / "empty"
            home.mkdir(); working.mkdir(); (root / "worker").mkdir()
            for name in ("scratch", "state", "log"):
                (root / "worker" / name).mkdir()
            (home / "config.toml").write_text(host.worker_config(root))
            identity = str(uuid.uuid4()).encode()
            (home / "installation_id").write_bytes(identity)
            (home / "installation_id").chmod(0o600)
            (home / "tmp").mkdir()
            writable = [str(root / "worker" / name) for name in ("scratch", "state", "log")]
            writable += [str(home / "tmp"), str(home / "installation_id")]
            profile = host.sandbox_profile(executable, [str(root), str(Path(executable).parent)], writable, network=True)
            env = {"PATH": "/usr/bin:/bin", "HOME": str(working), "CODEX_HOME": str(home),
                   "TMPDIR": str(root / "worker/scratch"), "LANG": "en_US.UTF-8", "NO_COLOR": "1"}
            process = subprocess.Popen(["/usr/bin/sandbox-exec", "-p", profile, executable, "app-server", "--listen", "stdio://"],
                                       env=env, cwd=working, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                       stderr=subprocess.PIPE, start_new_session=True)
            selector = selectors.DefaultSelector()
            messages, buffer, count = [], b"", 0
            def send(value):
                # This helper has no turn/start path; even failed tests cannot run inference.
                self.assertIn(value["method"], ("initialize", "initialized", "account/read", "thread/start"))
                process.stdin.write((json.dumps(value) + "\n").encode()); process.stdin.flush()
            try:
                for stream, kind in ((process.stdout, "output"), (process.stderr, "error")):
                    selector.register(stream, selectors.EVENT_READ, kind)
                send({"id": 1, "method": "initialize", "params": {"clientInfo": {"name": "rudi_reviewer_test", "version": "1"},
                     "capabilities": {"experimentalApi": True}}})
                deadline = time.monotonic() + 5
                while selector.get_map() and time.monotonic() < deadline:
                    for key, _ in selector.select(.05):
                        chunk = os.read(key.fd, 4096)
                        if not chunk:
                            selector.unregister(key.fileobj); continue
                        count += len(chunk)
                        self.assertLessEqual(count, 262144)
                        if key.data != "output":
                            continue
                        buffer += chunk
                        while b"\n" in buffer:
                            line, buffer = buffer.split(b"\n", 1)
                            message = json.loads(line); messages.append(message)
                            self.assertNotIn("error", message, "Native RPC failed")
                            if message.get("id") == 1:
                                send({"method": "initialized", "params": {}})
                                send({"id": 2, "method": "account/read", "params": {"refreshToken": False}})
                            if message.get("id") == 2:
                                self.assertIsNone(message["result"]["account"], "Probe must have no credentials")
                                send({"id": 3, "method": "thread/start", "params": {
                                    "model": "gpt-6-astra", "modelProvider": "openai", "allowProviderModelFallback": False,
                                    "cwd": str(working), "ephemeral": True, "sandbox": "read-only", "approvalPolicy": "never",
                                    "dynamicTools": [], "environments": [], "selectedCapabilityRoots": [], "runtimeWorkspaceRoots": [],
                                    "config": {"model_reasoning_effort": "xhigh", "web_search": "disabled", "features": {
                                        "shell_tool": False, "apps": False, "browser_use": False, "computer_use": False,
                                        "hooks": False, "image_generation": False}},
                                    "developerInstructions": "Protocol test only. No model turn will be started."}})
            finally:
                selector.close()
                drained = host.drain(process)
                for stream in (process.stdin, process.stdout, process.stderr): stream.close()
                self.assertTrue(drained)
            warnings = [m.get("params") for m in messages if m.get("method") in ("warning", "configWarning")]
            self.assertEqual(warnings, [])
            started = next(m["result"] for m in messages if m.get("id") == 3)
            self.assertEqual((started["model"], started["reasoningEffort"], started["modelProvider"]), ("gpt-6-astra", "xhigh", "openai"))
            self.assertEqual(started["approvalPolicy"], "never")
            self.assertEqual(started["sandbox"], {"type": "readOnly", "networkAccess": False})
            self.assertEqual(started["instructionSources"], [])
            self.assertTrue(started["thread"]["ephemeral"])
            self.assertEqual(started["thread"]["turns"], [])
            self.assertFalse((home / "auth.json").exists())
            # Runtime startup changes metadata permissions; the UUID is not a
            # credential and must remain verifiable without rewriting it.
            self.assertEqual(stat.S_IMODE((home / "installation_id").stat().st_mode), 0o644)
            self.assertEqual(host.read_installation_identity(home / "installation_id", os.getuid()), identity)


if __name__ == "__main__":
    unittest.main()
