import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
import hashlib
import subprocess
import sys
import signal
import time
import json
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("reviewer_host", Path(__file__).parents[1] / "deploy/reviewer_host.py")
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)


class CustodyTests(unittest.TestCase):
    def test_candidate_admission_allows_verified_launchd_helpers(self):
        class SourceReached(Exception):
            pass
        install = {'root': '/protected/reviewer', 'release': '/protected/reviewer/code/release',
                   'worker': {'uid': 503}, 'publisher': {'uid': 502}}
        rows = b'503 120 1 Tue Oct 6 12:00:00 2026\n'
        with patch.object(host, 'current_pilot', return_value=({}, b'{}')), \
             patch.object(host, 'protected_path', side_effect=lambda p, *a, **kw: Path(p)), \
             patch.object(host, 'checked_file', return_value=b'private'), \
             patch.object(host.subprocess, 'check_output', return_value='503 120\n'), \
             patch.object(host.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, rows, b'')), \
             patch.object(host, 'kernel_process_path', create=True, return_value='/usr/sbin/distnoted'), \
             patch.object(host, 'trusted_background_process', create=True, return_value=True), \
             patch.object(host, 'publisher_invoke', side_effect=SourceReached):
            with self.assertRaises(SourceReached):
                host.prepare_candidate(install)

    def test_native_installation_identity_allows_readable_metadata_but_rejects_unsafe_files(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw).resolve()
            path = root / 'installation_id'
            identity = b'6f77b1d1-7b93-49bd-9229-408453dd5eaf'
            path.write_bytes(identity)
            for mode in (0o600, 0o644):
                path.chmod(mode)
                self.assertEqual(host.read_installation_identity(path, os.getuid()), identity)
            path.chmod(0o664)
            with self.assertRaises(ValueError): host.read_installation_identity(path, os.getuid())
            path.chmod(0o644)
            with self.assertRaises(ValueError): host.read_installation_identity(path, os.getuid() + 1)
            alias = root / 'alias'
            alias.symlink_to(path)
            with self.assertRaises(ValueError): host.read_installation_identity(alias, os.getuid())
            alias.unlink()
            os.link(path, alias)
            with self.assertRaises(ValueError): host.read_installation_identity(path, os.getuid())
            alias.unlink()
            path.write_bytes(b'not-an-installation-id')
            with self.assertRaises(ValueError): host.read_installation_identity(path, os.getuid())

    def test_worker_config_disables_ambient_capabilities_and_keeps_state_outside_config(self):
        config = host.worker_config(Path('/protected/reviewer'))
        for feature in ['plugins', 'remote_plugin', 'multi_agent', 'skill_search', 'skill_mcp_dependency_install',
                        'workspace_dependencies', 'shell_snapshot', 'unified_exec', 'code_mode_host', 'tool_suggest', 'goals']:
            self.assertIn(feature + ' = false\n', config)
        self.assertIn('skip_host_skill_discovery = true', config)
        self.assertIn('sqlite_home = "/protected/reviewer/worker/state"', config)
        self.assertNotIn('/Users/', config)

    def test_catchable_stop_signals_drain_all_owned_children(self):
        for mode in ['supervised', 'capture', 'capture-spawn']:
            for stop in [signal.SIGTERM, signal.SIGHUP, signal.SIGINT]:
                with self.subTest(mode=mode, stop=stop), tempfile.TemporaryDirectory() as raw:
                    root = Path(raw).resolve()
                    worker_code = 'import os,time,sys,signal;signal.signal(signal.SIGTERM,signal.SIG_IGN);open(sys.argv[1],"w").write(str(os.getpid()));time.sleep(20)'
                    worker = [sys.executable, '-I', '-B', '-c', worker_code, str(root / 'worker.pid')]
                    controller = [sys.executable, '-I', '-B', '-c', worker_code, str(root / 'controller.pid')]
                    script = "import importlib.util,os,time\ns=importlib.util.spec_from_file_location('h'," + repr(str(Path(host.__file__).resolve())) + ");h=importlib.util.module_from_spec(s);s.loader.exec_module(h)\ngetattr(h,'install_stop_handlers',lambda:None)()\n"
                    if mode == 'capture-spawn':
                        script += 'launch=h.launch_as\ndef during_spawn(*a,**kw):\n p=launch(*a,**kw)\n while not os.path.exists(a[0][-1]): time.sleep(.005)\n os.kill(os.getpid(),15)\n return p\nh.launch_as=during_spawn\n'
                    if mode == 'supervised':
                        script += 'h.supervise_worker(' + repr(worker) + ',' + repr(controller) + ',{},{},' + repr(raw) + ',os.getuid(),os.getuid(),os.getgid(),os.getgid(),timeout=10)'
                    else:
                        script += 'h.bounded_capture(' + repr(worker) + ',{},' + repr(raw) + ',os.getuid(),os.getgid(),timeout=10)'
                    process = subprocess.Popen([sys.executable, '-I', '-B', '-c', script], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                    pids = []
                    try:
                        names = ['worker.pid', 'controller.pid'] if mode == 'supervised' else ['worker.pid']
                        end = time.monotonic() + 3
                        while time.monotonic() < end and any(not (root / name).exists() for name in names):
                            time.sleep(.01)
                        pids = [int((root / name).read_text()) for name in names]
                        if mode != 'capture-spawn':
                            os.kill(process.pid, stop)
                            time.sleep(.03)
                            os.kill(process.pid, stop)
                        output, _ = process.communicate(timeout=3)
                        self.assertNotEqual(process.returncode, 0)
                        self.assertEqual(output, b'')
                        for pid in pids:
                            with self.assertRaises(ProcessLookupError):
                                os.kill(pid, 0)
                    finally:
                        for pid in pids:
                            try: os.killpg(pid, signal.SIGKILL)
                            except ProcessLookupError: pass
                        if process.poll() is None: process.kill()
                        process.communicate(timeout=3)

    def test_owner_disable_does_not_require_a_healthy_runtime(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw).resolve()
            (root / 'policy').mkdir()
            (root / 'installation_id').write_text('corrupt')
            with patch.object(host, 'verify_installation', side_effect=ValueError('broken runtime')) as verify, \
                 patch.object(host, 'protected_path', side_effect=lambda path, **_kw: Path(path)), \
                 patch.object(host.os, 'geteuid', return_value=0), \
                 patch.object(host.os, 'fchown'), patch.object(host.sys, 'platform', 'darwin'), \
                 patch.object(host.sys, 'argv', ['reviewer_host.py', 'disable', '--root', str(root)]):
                self.assertEqual(host.main()['status'], 'pilot-disabled')
                self.assertEqual(host.main()['status'], 'pilot-disabled')
                verify.assert_not_called()
            self.assertEqual((root / 'policy/PILOT-DISABLED').read_bytes(), b'Pilot disabled by operator\n')

    def test_reads_exact_private_regular_bytes_and_rejects_links(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw).resolve()
            path = root / "receipt.json"
            path.write_bytes(b'{"private":true}')
            path.chmod(0o600)
            self.assertEqual(host.checked_file(path, os.getuid()), b'{"private":true}')
            (root / "alias").symlink_to(path)
            with self.assertRaises(ValueError):
                host.checked_file(root / "alias", os.getuid())
            os.link(path, root / "hardlink")
            with self.assertRaises(ValueError):
                host.checked_file(path, os.getuid())

    def test_document_proof_rejects_ambiguous_json_keys(self):
        text = '{"enabled":false,"enabled":true}'
        raw = text.encode()
        blob = {"text": text, "sha": hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()}
        with self.assertRaises(ValueError):
            host.document_proof({"schemaVersion": 1, "files": [{"path": "policy.json", "before": None, "after": blob}]})

    @unittest.skipUnless(sys.platform == "darwin", "macOS confinement probe")
    def test_kernel_denies_fork_exec_and_writes_outside_scratch(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw).resolve()
            scratch = root / "scratch"
            scratch.mkdir()
            program = str(Path(sys.executable).resolve())
            # Framework interpreters keep their library and stdlib outside the
            # executable's directory. Production proof also permits CLT runtime reads.
            profile = host.sandbox_profile(program, [str(Path(program).parents[1]), sys.base_prefix, str(root)], [str(scratch)])
            script = '''import os,sys,json
result={}
try:
 pid=os.fork()
 if pid==0: os._exit(0)
 os.waitpid(pid,0)
 result['forkDenied']=False
except PermissionError: result['forkDenied']=True
try:
 open(sys.argv[1],'w').close();result['writeDenied']=False
except PermissionError: result['writeDenied']=True
try: os.execv('/bin/sh',['sh','-c','exit 91'])
except PermissionError: result['execDenied']=True
print(json.dumps(result))'''
            r = subprocess.run(['/usr/bin/sandbox-exec', '-p', profile, program, '-I', '-B', '-c', script, str(root / 'escape')], capture_output=True, timeout=10)
            self.assertEqual(r.returncode, 0, r.stderr.decode())
            self.assertEqual(host.strict_json(r.stdout), {"forkDenied": True, "writeDenied": True, "execDenied": True})
            self.assertFalse((root / 'escape').exists())

    def test_supervisor_acknowledges_real_process_exit_and_limits_controller_output(self):
        with tempfile.TemporaryDirectory() as raw:
            worker = [sys.executable, '-I', '-B', '-c', 'import time; time.sleep(20)']
            controller = [sys.executable, '-I', '-B', '-c', '''import os,socket,json
c=socket.socket(fileno=int(os.environ['REVIEWER_CONTROL_FD']))
c.sendall(b'stop\\n'); reply=c.recv(1000)
assert json.loads(reply)=={'terminationConfirmed':True}
print('controller-complete')''']
            result = host.supervise_worker(worker, controller, {}, {}, raw, os.getuid(), os.getuid(), os.getgid(), os.getgid(), timeout=3)
            self.assertEqual(result, b'controller-complete\n')

    def test_supervisor_drains_worker_after_early_controller_exit(self):
        with tempfile.TemporaryDirectory() as raw:
            marker = Path(raw) / 'pid'
            worker = [sys.executable, '-I', '-B', '-c', 'import os,time,sys;open(sys.argv[1],"w").write(str(os.getpid()));time.sleep(20)', str(marker)]
            controller = [sys.executable, '-I', '-B', '-c', 'import time;time.sleep(.1)']
            with self.assertRaises(ValueError):
                host.supervise_worker(worker, controller, {}, {}, raw, os.getuid(), os.getuid(), os.getgid(), os.getgid(), timeout=2)
            pid = int(marker.read_text())
            with self.assertRaises(ProcessLookupError):
                os.kill(pid, 0)

    def test_bounded_capture_rejects_overflow_and_timeout(self):
        with tempfile.TemporaryDirectory() as raw:
            for script in ['print("x"*10000)', 'import time;time.sleep(10)']:
                with self.assertRaises(ValueError):
                    host.bounded_capture([sys.executable, '-I', '-B', '-c', script], {}, raw, os.getuid(), os.getgid(), timeout=.2, maximum=100)

    def test_supervisor_rejects_forged_or_missing_drain_request(self):
        with tempfile.TemporaryDirectory() as raw:
            worker = [sys.executable, '-I', '-B', '-c', 'import time;time.sleep(20)']
            for request in ['stop\\nextra', 'pretend-stopped\\n']:
                controller = [sys.executable, '-I', '-B', '-c', 'import os,socket,time;s=socket.socket(fileno=int(os.environ["REVIEWER_CONTROL_FD"]));s.sendall(' + repr(request.encode().decode('unicode_escape').encode()) + ');time.sleep(2)']
                with self.assertRaises(ValueError):
                    host.supervise_worker(worker, controller, {}, {}, raw, os.getuid(), os.getuid(), os.getgid(), os.getgid(), timeout=.3)

    def test_static_proof_accepts_documents_but_rejects_changed_bytes_and_whitespace(self):
        for text, valid in [('Document\n', True), ('{"valid": true}\n', True), ('trailing \n', False)]:
            raw = text.encode()
            sha = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
            source = {'schemaVersion': 1, 'files': [{'path': 'document.txt', 'before': None, 'after': {'text': text, 'sha': sha}}]}
            if valid:
                self.assertTrue(host.document_proof(source)['passed'])
            else:
                with self.assertRaises(ValueError):
                    host.document_proof(source)
            source['files'][0]['after']['sha'] = '0' * 40
            with self.assertRaises(ValueError):
                host.document_proof(source)

    def test_installer_requires_privileged_owner_before_writing(self):
        if os.getuid() == 0:
            self.skipTest('Nonroot denial proof')
        with tempfile.TemporaryDirectory() as raw:
            with self.assertRaises(ValueError):
                host.install_package(raw, raw, '0' * 64, '/no-node', '0' * 64, '/no-codex', '0' * 64, 'worker', 'publisher', 'author', '/no-python')
            self.assertEqual(list(Path(raw).iterdir()), [])

    def test_drain_confirms_exit_when_group_disappears_between_probe_and_signal(self):
        class Exited:
            pid = 987654
            def poll(self):
                return 0
        with patch.object(host.os, 'killpg', side_effect=[None, ProcessLookupError(), ProcessLookupError()]):
            self.assertTrue(host.drain(Exited()))

    def test_drain_reaps_exited_leader_before_macos_group_probe(self):
        class Zombie:
            pid = 987654
            reaped = False
            def poll(self):
                self.reaped = True
                return 0
        process = Zombie()
        def probe(_pid, _signal):
            if not process.reaped:
                raise PermissionError('unreaped empty macOS group')
            raise ProcessLookupError()
        with patch.object(host.os, 'killpg', side_effect=probe):
            self.assertTrue(host.drain(process))


if __name__ == "__main__":
    unittest.main()
