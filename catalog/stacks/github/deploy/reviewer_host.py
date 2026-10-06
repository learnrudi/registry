"""Finite protected macOS reviewer host. No daemon, scheduler or merge operation."""
import hashlib
import ctypes
import json
import os
from pathlib import Path
import stat
import subprocess
import signal
import socket
import selectors
import time
import pwd
import re
import sys
import argparse
import uuid

_stop_requested = False


def check_stop():
    if _stop_requested:
        raise RuntimeError("Protected execution stopped")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def strict_json(raw):
    def pairs(items):
        value = {}
        for key, item in items:
            if key in value:
                raise ValueError("Duplicate JSON key")
            value[key] = item
        return value
    def constant(_value):
        raise ValueError("Non-finite JSON")
    return json.loads(raw, object_pairs_hook=pairs, parse_constant=constant)


def checked_file(path, owner, maximum=600000):
    path = Path(path)
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(fd, "rb") as file:
            before = os.fstat(file.fileno())
            if (not stat.S_ISREG(before.st_mode) or before.st_uid != owner
                    or before.st_nlink != 1 or before.st_mode & 0o022
                    or before.st_size > maximum):
                raise ValueError("Protected file rejected")
            data = file.read(maximum + 1)
            after = os.fstat(file.fileno())
            keys = ("st_dev", "st_ino", "st_uid", "st_mode", "st_nlink", "st_size", "st_mtime_ns", "st_ctime_ns")
            if len(data) > maximum or len(data) != before.st_size or any(getattr(before, k) != getattr(after, k) for k in keys):
                raise ValueError("Protected file changed")
            return data
    except OSError:
        raise ValueError("Protected file rejected") from None


def protected_path(path, owner=0, directory=False, private=False):
    """Reject writable ancestry and ACL grants; never resolve through a symlink."""
    path = Path(path)
    if not path.is_absolute() or any(c in str(path) for c in '\n\r\0'):
        raise ValueError("Unsafe protected path")
    for item in [path, *path.parents]:
        info = item.lstat()
        wanted = {owner} if item == path else {0, owner}
        if (stat.S_ISLNK(info.st_mode) or info.st_uid not in wanted or info.st_mode & 0o022
                or (item != path and not stat.S_ISDIR(info.st_mode))):
            raise ValueError("Unsafe protected ancestry")
        if os.uname().sysname == "Darwin":
            acl = subprocess.run(["/bin/ls", "-lde", str(item)], capture_output=True, timeout=5, check=True)
            if len(acl.stdout.splitlines()) != 1:
                raise ValueError("ACL custody requires operator investigation")
    if directory != stat.S_ISDIR(path.lstat().st_mode) or (private and path.lstat().st_mode & 0o077):
        raise ValueError("Protected path mode mismatch")
    return path


def write_new(path, data, owner=0, mode=0o600):
    path = Path(path)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    with os.fdopen(fd, "wb") as file:
        file.write(data)
        if os.geteuid() == 0:
            os.fchown(file.fileno(), owner, 0)
        os.fchmod(file.fileno(), mode)
        file.flush()
        os.fsync(file.fileno())
    parent = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(parent)
    finally:
        os.close(parent)


def make_directory(path, mode=0o700, owner=0):
    path.mkdir(mode=mode)
    os.chown(path, owner, 0)
    path.chmod(mode)


def document_proof(source):
    """Trusted static checks, never eval/import/execute repository text."""
    if not isinstance(source, dict) or source.get("schemaVersion") != 1:
        raise ValueError("Invalid source packet")
    files = source.get("files")
    if not isinstance(files, list) or not 1 <= len(files) <= 100:
        raise ValueError("Invalid source files")
    seen = set()
    for item in files:
        path = item["path"]
        if path in seen or not path.endswith((".md", ".json", ".txt")):
            raise ValueError("Non-document source")
        seen.add(path)
        for side in ("before", "after"):
            blob = item[side]
            if blob is None:
                continue
            text = blob["text"]
            raw = text.encode("utf-8")
            actual = hashlib.sha1(b"blob " + str(len(raw)).encode("ascii") + b"\0" + raw).hexdigest()
            if actual != blob["sha"] or "\0" in text:
                raise ValueError("Source bytes changed")
            if side == "after":
                if any(line.endswith((" ", "\t")) for line in text.splitlines()):
                    raise ValueError("Trailing whitespace")
                if path.endswith(".json"):
                    strict_json(text)
    return {"schemaVersion": 1, "filesChecked": len(files), "check": "document-integrity", "passed": True}


def sandbox_profile(program, readable, writable, network=False):
    def literal(path):
        if not Path(path).is_absolute() or any(c in str(path) for c in '\n\r\0'):
            raise ValueError("Invalid sandbox path")
        return json.dumps(str(path))
    read_paths = ["/System", "/usr/lib", *readable]
    lines = ["(version 1)", "(deny default)", "(allow sysctl-read)",
             "(allow file-read-metadata)",
             # dyld needs the root directory itself; this does not grant reads
             # of its descendants. A missing allowance aborts before main().
             "(allow file-read* (literal \"/\"))",
             "(allow file-read* (literal \"/dev/urandom\") (literal \"/dev/random\") (literal \"/dev/null\"))",
             "(allow file-write* (literal \"/dev/null\"))",
             "(allow process-exec (literal " + literal(program) + "))"]
    lines += ["(allow file-read* (subpath " + literal(p) + "))" for p in read_paths]
    lines += ["(allow file-write* (subpath " + literal(p) + "))" for p in writable]
    if network:
        lines += ["(allow network-outbound (remote tcp \"*:443\"))",
                  "(allow network-outbound (remote udp \"*:53\"))",
                  # macOS getaddrinfo uses this DNS service socket, not direct
                  # UDP alone. Other local sockets remain denied.
                  "(allow network-outbound (literal \"/private/var/run/mDNSResponder\"))",
                  "(allow file-read* (subpath \"/private/etc\") (subpath \"/private/var/db/timezone\"))",
                  "(allow mach-lookup (global-name \"com.apple.system.opendirectoryd.membership\")",
                  " (global-name \"com.apple.cfprefsd.daemon\") (global-name \"com.apple.trustd.agent\")",
                  " (global-name \"com.apple.networkd\") (global-name \"com.apple.SystemConfiguration.configd\"))"]
    # No process-fork, signal, task-port, launch service, general Mach IPC, local
    # socket (except the network worker's DNS service), inbound network or
    # additional executable allowance. setsid cannot
    # escape restrictions inherited by this process; child creation is denied.
    return "\n".join(lines) + "\n"


def supervise_worker(worker_args, controller_args, worker_env, controller_env,
                     working_directory, worker_uid, publisher_uid, worker_gid,
                     publisher_gid, timeout=900):
    worker = controller = None
    parent, child = socket.socketpair()
    selector = selectors.DefaultSelector()
    output = bytearray()
    total = {}
    stop_request = bytearray()
    acknowledged = False
    try:
        worker = launch_as(worker_args, worker_env, working_directory, worker_uid, worker_gid)
        env = dict(controller_env, REVIEWER_READ_FD=str(worker.stdout.fileno()),
                   REVIEWER_WRITE_FD=str(worker.stdin.fileno()), REVIEWER_CONTROL_FD=str(child.fileno()))
        controller = launch_as(controller_args, env, working_directory, publisher_uid, publisher_gid,
                               (worker.stdout.fileno(), worker.stdin.fileno(), child.fileno()))
        child.close()
        # The controller alone consumes the RPC channel. Parent retains only
        # lifecycle supervision and bounded stderr; no worker control endpoint.
        worker.stdout.close()
        worker.stdin.close()
        for stream, name in [(worker.stderr, "worker-error"), (controller.stdout, "output"),
                             (controller.stderr, "controller-error"), (parent, "control")]:
            selector.register(stream, selectors.EVENT_READ, name)
            total[name] = 0
        deadline = time.monotonic() + timeout
        while selector.get_map():
            check_stop()
            if time.monotonic() >= deadline:
                raise ValueError("Supervision deadline")
            for key, _ in selector.select(0.05):
                data = os.read(key.fd, 4096)
                if not data:
                    selector.unregister(key.fileobj)
                    if key.data == "control" and not acknowledged:
                        raise ValueError("Supervisor channel closed")
                    continue
                total[key.data] += len(data)
                limit = 16 if key.data == "control" else 4096 if key.data == "output" else 262144
                if total[key.data] > limit:
                    raise ValueError("Supervision output limit")
                if key.data == "output":
                    output.extend(data)
                if key.data == "control":
                    stop_request.extend(data)
                    if b"\n" in stop_request:
                        if stop_request != b"stop\n" or acknowledged:
                            raise ValueError("Invalid supervisor request")
                        confirmed = drain(worker)
                        parent.sendall(json.dumps({"terminationConfirmed": confirmed}).encode() + b"\n")
                        acknowledged = confirmed
                        selector.unregister(parent)
                        parent.close()
                        if not confirmed:
                            raise ValueError("Worker death unconfirmed")
            if controller.poll() is not None and not acknowledged:
                raise ValueError("Controller exited before drain")
        if controller.wait(timeout=1) != 0 or not acknowledged:
            raise ValueError("Controller rejected")
        return bytes(output)
    finally:
        selector.close()
        parent.close()
        child.close()
        drained = True
        for process in (worker, controller):
            if process is not None:
                drained = drain(process) and drained
                for stream in (process.stdin, process.stdout, process.stderr):
                    if stream:
                        stream.close()
        if not drained:
            raise ValueError("Supervised process drain remains uncertain")


def launch_as(args, env, cwd, uid, gid, pass_fds=()):
    check_stop()
    def identity():
        if os.geteuid() == 0:
            os.setgroups([])
            os.setgid(gid)
            os.setuid(uid)
        elif (os.geteuid(), os.getegid()) != (uid, gid):
            raise ValueError("Identity change requires root")
        os.umask(0o077)
    return subprocess.Popen(args, cwd=cwd, env=env, stdin=subprocess.PIPE,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            start_new_session=True, close_fds=True, pass_fds=pass_fds,
                            preexec_fn=identity)


def drain(process):
    def present():
        try:
            os.killpg(process.pid, 0)
            return True
        except ProcessLookupError:
            return False
    try:
        for sig, grace in [(signal.SIGTERM, 0.15), (signal.SIGKILL, 0.75)]:
            process.poll()  # Reap an exited leader before macOS killpg probes.
            if present():
                try:
                    os.killpg(process.pid, sig)
                except ProcessLookupError:
                    pass  # Reap/confirm below; absence between reads is valid.
            end = time.monotonic() + grace
            while time.monotonic() < end:
                if process.poll() is not None and not present():
                    return True
                time.sleep(0.01)
        return process.poll() is not None and not present()
    except OSError:
        process.poll()
        return False


GITHUB_MODULES = ["core", "request-config", "deadline", "merge-readiness", "native-acceptance", "publication-journal",
                  "review-authority-store", "review-controller", "review-evidence", "review-publisher",
                  "review-request", "reviewer-auth", "reviewer-transport", "reviewer-source", "reviewer-service"]
NATIVE_MODULES = ["codex-review", "codex-review-rpc", "codex-review-supervised"]


def package_files(repository):
    base = Path(repository) / "catalog/stacks"
    files = {"github/dist/" + name + ".js": base / ("github/dist/" + name + ".js") for name in GITHUB_MODULES}
    files.update({"agent-hosts/src/" + name + ".js": base / ("agent-hosts/src/" + name + ".js") for name in NATIVE_MODULES})
    for name in ["reviewer_host.py", "pilot-entry.mjs"]:
        files["github/deploy/" + name] = base / ("github/deploy/" + name)
    return files


def build_package(repository, destination):
    repository, destination = Path(repository).resolve(), Path(destination)
    revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repository, text=True).strip()
    files = package_files(repository)
    source_paths = ["catalog/stacks/github/src/" + name + ".ts" for name in GITHUB_MODULES]
    source_paths += ["catalog/stacks/agent-hosts/src/" + name + ".js" for name in NATIVE_MODULES]
    source_paths += ["catalog/stacks/github/deploy/" + name for name in ["reviewer_host.py", "pilot-entry.mjs"]]
    sources = {}
    for name in source_paths:
        committed = subprocess.check_output(["git", "show", revision + ":" + name], cwd=repository)
        if committed != (repository / name).read_bytes():
            raise ValueError("Package source is not the committed revision")
        sources[name] = digest(committed)
    destination.mkdir(mode=0o700)
    manifest = {"schemaVersion": 1, "sourceCommit": revision, "sourceHashes": sources, "files": {}}
    for name, path in files.items():
        data = checked_file(path, os.getuid(), 1000000)
        target = destination / name
        target.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
        write_new(target, data, os.getuid(), 0o644)
        manifest["files"][name] = digest(data)
    for name in ["github/package.json", "agent-hosts/package.json"]:
        data = b'{"type":"module"}\n'
        write_new(destination / name, data, os.getuid(), 0o644)
        manifest["files"][name] = digest(data)
    raw = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()
    write_new(destination / "manifest.json", raw, os.getuid(), 0o644)
    return {"sourceCommit": revision, "manifestDigest": digest(raw), "files": len(manifest["files"])}


def account(name, isolated=False):
    if not re.fullmatch(r"[a-z][a-z0-9_-]{0,63}", name):
        raise ValueError("Invalid account name")
    entry = pwd.getpwnam(name)
    if entry.pw_uid == 0:
        raise ValueError("Root cannot be a reviewer role")
    if isolated:
        groups = subprocess.check_output(["/usr/bin/id", "-Gn", name], text=True, timeout=5).split()
        if set(groups) & {"admin", "wheel"}:
            raise ValueError("Reviewer role is privileged")
    return {"name": name, "uid": entry.pw_uid, "gid": entry.pw_gid}


def worker_config(root):
    return ('model = "gpt-6-astra"\nmodel_reasoning_effort = "xhigh"\nmodel_provider = "openai"\n'
              # Acknowledge the explicitly selected experimental discovery guard;
              # the native adapter still rejects unexpected warning events.
              'suppress_unstable_features_warning = true\n'
              'approval_policy = "never"\nsandbox_mode = "read-only"\nweb_search = "disabled"\n'
              'cli_auth_credentials_store = "file"\n' + 'sqlite_home = ' + json.dumps(str(root / "worker/state")) + '\n'
              + 'log_dir = ' + json.dumps(str(root / "worker/log")) + '\n'
              + '[history]\npersistence = "none"\n[features]\nshell_tool = false\napps = false\nbrowser_use = false\ncomputer_use = false\nhooks = false\nimage_generation = false\n'
              'plugins = false\nremote_plugin = false\nmulti_agent = false\nskill_search = false\n'
              'skill_mcp_dependency_install = false\nskip_host_skill_discovery = true\nworkspace_dependencies = false\n'
              'shell_snapshot = false\nunified_exec = false\ncode_mode_host = false\ntool_suggest = false\ngoals = false\n')


def install_package(root, package, manifest_digest, node, node_digest, codex, codex_digest,
                    worker_name, publisher_name, author_name, python):
    if os.geteuid() != 0 or sys.platform != "darwin":
        raise ValueError("macOS owner installation requires root")
    root = protected_path(root, directory=True)
    for name in ["code", "policy", "operator", "inputs", "proof"]:
        protected_path(root / name, directory=True, private=name in {"operator", "inputs", "proof"})
    worker, publisher, author = account(worker_name, True), account(publisher_name, True), account(author_name)
    if len({worker["uid"], publisher["uid"], author["uid"]}) != 3:
        raise ValueError("Reviewer roles must be distinct")
    for name, role in [("worker", worker), ("publisher", publisher)]:
        protected_path(root / name, role["uid"], directory=True, private=True)
    raw = checked_file(Path(package) / "manifest.json", Path(package).stat().st_uid, 100000)
    if digest(raw) != manifest_digest:
        raise ValueError("Unapproved package manifest")
    manifest = strict_json(raw)
    wanted = set(package_files(".").keys()) | {"github/package.json", "agent-hosts/package.json"}
    if set(manifest) != {"schemaVersion", "sourceCommit", "sourceHashes", "files"} or manifest["schemaVersion"] != 1 or set(manifest["files"]) != wanted:
        raise ValueError("Unexpected package files")
    if not re.fullmatch(r"[a-f0-9]{40}", manifest["sourceCommit"]):
        raise ValueError("Invalid source revision")
    binaries = {}
    for name, source, expected in [("node", node, node_digest), ("codex", codex, codex_digest)]:
        path = Path(source).resolve(strict=True)
        data = checked_file(path, path.stat().st_uid, 268435456)
        if digest(data) != expected:
            raise ValueError("Unapproved runtime bytes")
        binaries[name] = data
    python = protected_path(Path(python).resolve(strict=True))
    if not str(python).startswith("/Library/Developer/CommandLineTools/"):
        raise ValueError("Protected CLT Python required")
    # No overwrite/update/restart semantics. A partial install remains for owner
    # investigation, and no descriptor is written until installation completes.
    release = root / "code" / ("release-" + manifest_digest[:24])
    make_directory(release, 0o755)
    for name, expected in manifest["files"].items():
        source = Path(package) / name
        data = checked_file(source, source.lstat().st_uid, 1000000)
        if digest(data) != expected:
            raise ValueError("Package bytes changed")
        target = release / name
        target.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
        for directory in [target.parent, *target.parent.parents]:
            if directory == release:
                break
            directory.chmod(0o755)
        write_new(target, data, mode=0o444)
    make_directory(release / "bin", 0o755)
    for name, data in binaries.items():
        write_new(release / "bin" / name, data, mode=0o555)
        dependencies = subprocess.check_output(["/usr/bin/otool", "-L", str(release / "bin" / name)], text=True, timeout=10).splitlines()[1:]
        if any(not line.strip().startswith(("/System/Library/", "/usr/lib/")) for line in dependencies):
            raise ValueError("Runtime has unprotected dynamic dependencies")
    codex_home, working = root / "code/codex-home", root / "code/empty"
    make_directory(codex_home, 0o755)
    make_directory(working, 0o555)
    for parent, names, role in [(root / "worker", ["scratch", "state", "log", "login"], worker),
                                (root / "publisher", ["authority", "journal"], publisher)]:
        for name in names:
            path = parent / name
            make_directory(path, 0o700, role["uid"])
    config = worker_config(root)
    write_new(codex_home / "config.toml", config.encode(), mode=0o444)
    # 0.151 opens installation_id read/write even when it exists. These two
    # runtime locations confer no configuration authority; the parent is root.
    write_new(codex_home / "installation_id", str(uuid.uuid4()).encode(), worker["uid"])
    make_directory(codex_home / "tmp", 0o700, worker["uid"])
    profile = sandbox_profile(str(release / "bin/codex"), [str(root / "code"), str(root / "worker")], [str(root / "worker/scratch"), str(root / "worker/state"), str(root / "worker/log"), str(codex_home / "installation_id"), str(codex_home / "tmp")], network=True)
    write_new(root / "policy/worker.sb", profile.encode(), mode=0o444)
    install = {"schemaVersion": 1, "root": str(root), "release": str(release), "manifest": manifest,
               "manifestDigest": manifest_digest, "worker": worker, "publisher": publisher, "author": author,
               "python": str(python), "pythonDigest": digest(checked_file(python, 0, 268435456)),
               "nodeDigest": node_digest, "codexDigest": codex_digest,
               "configDigest": digest(config.encode()), "profileDigest": digest(profile.encode()),
               "configurationDigest": digest(config.encode() + b'\0' + profile.encode()),
               "codexHome": str(codex_home), "workingDirectory": str(working), "mergeAuthorized": False}
    write_new(root / "policy/installation.json", json.dumps(install, sort_keys=True).encode(), mode=0o444)
    return {"status": "installed-inactive", "sourceCommit": manifest["sourceCommit"], "manifestDigest": manifest_digest, "mergeAuthorized": False}


def read_installation_identity(path, owner):
    # Codex 0.151 makes this non-secret runtime UUID readable (0644). It confers
    # no configuration authority. Keep custody, link, write and content checks;
    # credentials and private runtime directories retain their private modes.
    identity = checked_file(protected_path(path, owner), owner, 100)
    if not re.fullmatch(rb"[a-f0-9-]{36}", identity):
        raise ValueError("Invalid native installation identity")
    return identity


def verify_installation(root):
    if os.geteuid() != 0 or sys.platform != "darwin":
        raise ValueError("Protected verification requires owner root")
    root = protected_path(root, directory=True)
    path = protected_path(root / "policy/installation.json")
    install = strict_json(checked_file(path, 0))
    if install["schemaVersion"] != 1 or install["root"] != str(root) or install["mergeAuthorized"] is not False:
        raise ValueError("Installation identity changed")
    for name in ["worker", "publisher", "author"]:
        if account(install[name]["name"], name != "author") != install[name]:
            raise ValueError("Account identity changed")
    release = protected_path(install["release"], directory=True)
    if release.parent != root / "code":
        raise ValueError("Release path changed")
    for name, expected in install["manifest"]["files"].items():
        if digest(checked_file(protected_path(release / name), 0, 1000000)) != expected:
            raise ValueError("Installed code changed")
    for name in ["node", "codex"]:
        if digest(checked_file(protected_path(release / "bin" / name), 0, 268435456)) != install[name + "Digest"]:
            raise ValueError("Installed runtime changed")
    if digest(checked_file(protected_path(install["python"]), 0, 268435456)) != install["pythonDigest"]:
        raise ValueError("Proof interpreter changed")
    config = checked_file(protected_path(root / "code/codex-home/config.toml"), 0)
    profile = checked_file(protected_path(root / "policy/worker.sb"), 0)
    if digest(config) != install["configDigest"] or digest(profile) != install["profileDigest"] or digest(config + b'\0' + profile) != install["configurationDigest"]:
        raise ValueError("Installed configuration changed")
    if set(p.name for p in (root / "code/codex-home").iterdir()) - {"config.toml", "auth.json", "installation_id", "tmp"}:
        raise ValueError("Unexpected worker configuration")
    protected_path(root / "code/codex-home/tmp", install["worker"]["uid"], directory=True, private=True)
    read_installation_identity(root / "code/codex-home/installation_id", install["worker"]["uid"])
    if list(Path(install["workingDirectory"]).iterdir()):
        raise ValueError("Worker cwd is not empty")
    for directory in [Path(install["workingDirectory"]), *Path(install["workingDirectory"]).parents]:
        if (directory / "AGENTS.md").exists() or (directory / ".codex").exists():
            raise ValueError("Unexpected inherited configuration")
    for name in ["code", "policy", "operator", "inputs", "proof"]:
        protected_path(root / name, directory=True, private=name in {"operator", "inputs", "proof"})
    for name in ["worker", "publisher"]:
        protected_path(root / name, install[name]["uid"], directory=True, private=True)

    worker = install["worker"]
    version = bounded_capture([str(Path(install["release"]) / "bin/codex"), "--version"], {"PATH": "/usr/bin:/bin"},
                              install["workingDirectory"], worker["uid"], worker["gid"], maximum=1000)
    if version.strip() != b"codex-cli 0.151.0":
        raise ValueError("Unsupported Codex runtime")
    return install


def bounded_capture(args, env, cwd, uid, gid, input_bytes=b"", timeout=30, maximum=600000):
    process = launch_as(args, env, cwd, uid, gid)
    selector = selectors.DefaultSelector()
    result = bytearray()
    errors = 0
    try:
        # Inputs are bounded trusted JSON. communicate's input would be bounded
        # but its output is not, so use nonblocking pipes for both directions.
        os.set_blocking(process.stdin.fileno(), False)
        pending = memoryview(input_bytes)
        if pending:
            selector.register(process.stdin, selectors.EVENT_WRITE, "input")
        else:
            process.stdin.close()
        selector.register(process.stdout, selectors.EVENT_READ, "output")
        selector.register(process.stderr, selectors.EVENT_READ, "error")
        end = time.monotonic() + timeout
        while selector.get_map():
            check_stop()
            if time.monotonic() > end:
                raise ValueError("Protected child deadline")
            for key, _ in selector.select(0.05):
                if key.data == "input":
                    sent = os.write(key.fd, pending[:4096])
                    pending = pending[sent:]
                    if not pending:
                        selector.unregister(key.fileobj)
                        process.stdin.close()
                    continue
                chunk = os.read(key.fd, 4096)
                if not chunk:
                    selector.unregister(key.fileobj)
                    continue
                if key.data == "output":
                    result.extend(chunk)
                else:
                    errors += len(chunk)
                if len(result) > maximum or errors > 262144:
                    raise ValueError("Protected child output limit")
        if process.wait(timeout=1) != 0 or not drain(process):
            raise ValueError("Protected child failed")
        return bytes(result)
    finally:
        selector.close()
        drained = drain(process)
        for stream in [process.stdin, process.stdout, process.stderr]:
            stream.close()
        if not drained:
            raise ValueError("Protected child drain remains uncertain")


def publisher_command(install, mode):
    release = Path(install["release"])
    return [str(release / "bin/node"), str(release / "github/deploy/pilot-entry.mjs"), install["root"], mode]


def publisher_invoke(install, mode, timeout=120):
    role = install["publisher"]
    return bounded_capture(publisher_command(install, mode), {"PATH": "/usr/bin:/bin", "HOME": str(Path(install["root"]) / "publisher")},
                           install["workingDirectory"], role["uid"], role["gid"], timeout=timeout)


def validate_pilot(value):
    keys = {"schemaVersion", "requestId", "reviewEnabled", "publicationEnabled", "mergeAuthorized", "expiresAt",
            "target", "app", "botUserId", "contractText", "ownerApprovalText", "authorHostId", "reviewerHostId", "proofHostId"}
    if not isinstance(value, dict) or set(value) != keys or value["schemaVersion"] != 1 or value["mergeAuthorized"] is not False:
        raise ValueError("Invalid pilot policy")
    if any(type(value[k]) is not bool for k in ["reviewEnabled", "publicationEnabled"]):
        raise ValueError("Invalid pilot enable control")
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", value["requestId"]):
        raise ValueError("Invalid pilot request")
    for key in ["authorHostId", "reviewerHostId", "proofHostId"]:
        if not re.fullmatch(r"[A-Za-z0-9_.:-]{1,128}", value[key]):
            raise ValueError("Invalid pilot authority")
    if len({value[k] for k in ["authorHostId", "reviewerHostId", "proofHostId"]}) != 3:
        raise ValueError("Pilot authorities must be distinct")
    for key in ["contractText", "ownerApprovalText"]:
        if not isinstance(value[key], str) or not value[key].strip() or len(value[key].encode()) > 65536 or '\0' in value[key]:
            raise ValueError("Missing approved contract")
    if type(value["expiresAt"]) is not int or not 0 < value["expiresAt"] - int(time.time() * 1000) <= 3600000:
        raise ValueError("Pilot authorization is not current")
    app = value["app"]
    if not isinstance(app, dict) or set(app) != {"appId", "installationId", "accountId"}:
        raise ValueError("Invalid App identity")
    for item in [*app.values(), value["botUserId"]]:
        if type(item) is not int or item <= 0:
            raise ValueError("Invalid App identifier")
    target = value["target"]
    if not isinstance(target, dict) or set(target) != {"repositoryId", "owner", "repo", "pullNumber", "baseBranch", "baseSha", "headSha", "allowedPaths"}:
        raise ValueError("Invalid selected candidate")
    for key in ["repositoryId", "pullNumber"]:
        if type(target[key]) is not int or target[key] <= 0:
            raise ValueError("Invalid candidate identifier")
    for key in ["owner", "repo"]:
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,99}", target[key]):
            raise ValueError("Invalid repository name")
    for key in ["baseSha", "headSha"]:
        if not re.fullmatch(r"[a-f0-9]{40}", target[key]):
            raise ValueError("Invalid source revision")
    if not isinstance(target["baseBranch"], str) or not target["baseBranch"] or len(target["baseBranch"]) > 200:
        raise ValueError("Invalid base branch")
    paths = target["allowedPaths"]
    if not isinstance(paths, list) or not 1 <= len(paths) <= 100 or len(set(paths)) != len(paths):
        raise ValueError("Invalid path allowlist")
    for path in paths:
        if not isinstance(path, str) or not re.fullmatch(r"[A-Za-z0-9_. /-]+\.(md|json|txt)", path) or any(p in {"", ".", "..", ".git"} for p in path.split("/")):
            raise ValueError("Invalid document path")
    return value


def configure_pilot(install, source, expected):
    path = Path(source)
    raw = checked_file(path, path.stat().st_uid)
    if digest(raw) != expected:
        raise ValueError("Pilot policy differs from owner approval")
    value = validate_pilot(strict_json(raw))
    write_new(Path(install["root"]) / "policy/pilot.json", raw, mode=0o444)
    return {"status": "pilot-policy-recorded", "requestId": value["requestId"], "mergeAuthorized": False}


def current_pilot(install):
    check_stop()
    root = Path(install["root"])
    if (root / "policy/PILOT-DISABLED").exists():
        raise ValueError("Pilot is revoked")
    raw = checked_file(protected_path(root / "policy/pilot.json"), 0)
    value = validate_pilot(strict_json(raw))
    if not value["reviewEnabled"]:
        raise ValueError("Pilot review is disabled")
    return value, raw


def probe_access(operations):
    results = []
    for item in operations:
        if set(item) != {"id", "path", "operation"} or item["operation"] not in {"read", "write"}:
            raise ValueError("Invalid probe")
        allowed = False
        try:
            fd = os.open(item["path"], (os.O_RDONLY if item["operation"] == "read" else os.O_WRONLY) | os.O_NOFOLLOW | os.O_NONBLOCK)
            os.close(fd)
            allowed = True
        except PermissionError:
            pass
        results.append({"id": item["id"], "allowed": allowed})
    return results


def confinement_probe():
    try:
        pid = os.fork()
        if pid == 0:
            os._exit(0)
        os.waitpid(pid, 0)
        raise ValueError("Fork was allowed")
    except PermissionError:
        pass
    # A successful escape replaces this process with a nonzero exit and cannot
    # create a passing receipt. No shell is ever run in the accepted case.
    try:
        os.execv("/bin/sh", ["sh", "-c", "exit 93"])
    except PermissionError:
        return {"forkDenied": True, "otherExecDenied": True}


def proof_invocation(install, mode, data, network=False, production_reads=False):
    root, release = Path(install["root"]), Path(install["release"])
    script = str(release / "github/deploy/reviewer_host.py")
    python = install["python"]
    reads = [str(release), "/Library/Developer/CommandLineTools"]
    if production_reads:
        reads += [str(root / "code"), str(root / "worker")]
    profile = sandbox_profile(python, reads, [], network=network)
    role = install["worker"]
    args = ["/usr/bin/sandbox-exec", "-p", profile, python, "-I", "-B", script, mode]
    raw = bounded_capture(args, {"PATH": "/usr/bin:/bin"}, install["workingDirectory"], role["uid"], role["gid"], json.dumps(data).encode(), timeout=15)
    return raw


def remaining_process_time(deadline):
    check_stop()
    budget = min(5, deadline - time.monotonic())
    if budget <= 0:
        raise ValueError("Process inspection deadline exhausted")
    return budget


BACKGROUND_PROCESSES = frozenset(('/usr/sbin/distnoted', '/usr/sbin/cfprefsd',
    '/System/Library/Frameworks/Contacts.framework/Support/contactsd'))


def process_inventory(worker_uid, publisher_uid, deadline):
    result = subprocess.run(['/bin/ps','-axo','uid=,pid=,ppid=,lstart='],
        env={'PATH':'/usr/bin:/bin','LANG':'C','LC_ALL':'C'}, capture_output=True, check=True, timeout=remaining_process_time(deadline))
    remaining_process_time(deadline)
    if len(result.stdout) > 2000000:
        raise ValueError('process inventory rejected')
    rows = []
    for line in result.stdout.decode('utf-8', 'strict').splitlines():
        fields = line.split()
        if len(fields) != 8:
            raise ValueError('process inventory rejected')
        uid, pid, parent = map(int, fields[:3])
        if [str(uid),str(pid),str(parent)] != fields[:3]:
            raise ValueError('process inventory rejected')
        if pid <= 0 or pid > 2147483647:
            raise ValueError('process identity rejected')
        if uid in (worker_uid, publisher_uid):
            rows.append((uid,pid,parent,' '.join(fields[3:])))
    return sorted(rows)


def kernel_process_path(pid):
    library = ctypes.CDLL('/usr/lib/libproc.dylib', use_errno=True)
    library.proc_pidpath.argtypes = [ctypes.c_int, ctypes.c_void_p, ctypes.c_uint32]
    library.proc_pidpath.restype = ctypes.c_int
    buffer = ctypes.create_string_buffer(4096)
    if library.proc_pidpath(pid, buffer, len(buffer)) <= 0:
        raise ValueError('process path unavailable')
    return os.fsdecode(buffer.value)


def trusted_background_process(path, deadline):
    # Names reported by ps are not executable identity. Only these observed
    # launchd helpers, from kernel paths and protected Apple-signed bytes, qualify.
    if path not in BACKGROUND_PROCESSES:
        return False
    executable = Path(path)
    for item in [executable, *executable.parents]:
        info = item.lstat()
        if stat.S_ISLNK(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            return False
        acl = subprocess.run(['/bin/ls','-lde',str(item)],capture_output=True,check=True,timeout=remaining_process_time(deadline))
        if len(acl.stdout.splitlines()) != 1:
            return False
    if not stat.S_ISREG(executable.lstat().st_mode):
        return False
    signed = subprocess.run(['/usr/bin/codesign','--verify','--strict','-R','=anchor apple',path],
        capture_output=True,timeout=remaining_process_time(deadline))
    remaining_process_time(deadline)
    return signed.returncode == 0


def reviewer_activity(install, deadline=None):
    deadline = time.monotonic() + 20 if deadline is None else deadline
    worker_uid, publisher_uid = install["worker"]["uid"], install["publisher"]["uid"]
    root = Path(install["root"])
    rows = process_inventory(worker_uid, publisher_uid, deadline)
    checked, paths = {}, {}
    for uid, pid, parent, started in rows:
        try:
            path = kernel_process_path(pid)
        except ValueError:
            return True
        paths[pid] = path
        if uid == worker_uid:
            if parent != 1:
                return True
            if path not in checked:
                checked[path] = trusted_background_process(path, deadline)
            if not checked[path]:
                return True
        elif path.startswith(str(root / 'code') + '/'):
            return True
    # Reject churn/PID reuse rather than declaring an uncertain inventory idle.
    if process_inventory(worker_uid, publisher_uid, deadline) != rows:
        return True
    for pid, path in paths.items():
        try:
            current = kernel_process_path(pid)
        except ValueError:
            return True
        if current != path:
            return True
    remaining_process_time(deadline)
    return False


def prepare_candidate(install):
    root, release = Path(install["root"]), Path(install["release"])
    pilot, pilot_raw = current_pilot(install)
    authority = protected_path(root / "publisher/authority", install["publisher"]["uid"], directory=True, private=True)
    for name in ["app-key.pem", "evidence-key.pem", "evidence-public.pem"]:
        checked_file(protected_path(root / "publisher" / name, install["publisher"]["uid"], private=True), install["publisher"]["uid"], 16384)
    checked_file(protected_path(root / "code/codex-home/auth.json", install["worker"]["uid"], private=True), install["worker"]["uid"], 32768)
    if reviewer_activity(install):
        raise ValueError("Reviewer identity has live or unverified processes")
    source_raw = publisher_invoke(install, "source")
    source = strict_json(source_raw)
    if digest(source["sourceText"].encode()) != source["sourceDigest"]:
        raise ValueError("Imported source changed")
    # Preserve the exact imported representation under independent root custody.
    write_new(root / "inputs" / (pilot["requestId"] + ".source.json"), source_raw)
    proof_output = proof_invocation(install, "document-proof", strict_json(source["sourceText"]))
    proof_result = strict_json(proof_output)
    if proof_result.get("passed") is not True or proof_result.get("filesChecked") != len(source["files"]):
        raise ValueError("Document proof failed")
    host_hash = digest(checked_file(release / "github/deploy/reviewer_host.py", 0, 1000000))
    command_hash = digest((host_hash + ":document-proof:v1").encode())
    checks = ["runtime-custody", "configuration-custody", "worker-isolation", "process-confinement", "credential-separation"]
    commands = [{"id": name, "commandDigest": digest((host_hash + ":" + name + ":" + install["configurationDigest"]).encode())} for name in checks]
    policy = {"schemaVersion": 2, "enabled": True, "repositoryIds": [pilot["target"]["repositoryId"]], "model": "gpt-6-astra", "effort": "xhigh",
              "reviewerHostId": pilot["reviewerHostId"], "proofHostId": pilot["proofHostId"], "requiredChecks": [{"id": "document-integrity", "commandDigest": command_hash}],
              "acceptance": {"assurance": "native-session-configuration", "approvalDigest": digest(pilot["ownerApprovalText"].encode()), "runtime": "0.151.0",
                             "binaryDigest": install["codexDigest"], "configurationDigest": install["configurationDigest"], "requiredRuntimeChecks": commands}}
    policy_raw = json.dumps(policy, separators=(",", ":")).encode()
    target = pilot["target"]
    proof = {"schemaVersion": 1, "repositoryId": target["repositoryId"], "baseSha": target["baseSha"], "headSha": target["headSha"],
             "contractDigest": digest(pilot["contractText"].encode()), "sourceDigest": source["sourceDigest"], "policyDigest": digest(policy_raw),
             "executorHostId": pilot["proofHostId"], "terminationConfirmed": True,
             "checks": [{"id": "document-integrity", "commandDigest": command_hash, "exitCode": 0, "outputDigest": digest(proof_output)}]}
    confinement = proof_invocation(install, "confinement-probe", {}, network=True, production_reads=True)
    if strict_json(confinement) != {"forkDenied": True, "otherExecDenied": True}:
        raise ValueError("Confinement probe failed")
    operations = [{"id": "app-key", "path": str(root / "publisher/app-key.pem"), "operation": "read"},
                  {"id": "signing-key", "path": str(root / "publisher/evidence-key.pem"), "operation": "read"},
                  {"id": "config-write", "path": str(root / "code/codex-home/config.toml"), "operation": "write"}]
    custody = []
    for role_name in ["author", "worker"]:
        role = install[role_name]
        observed = strict_json(bounded_capture([install["python"], "-I", "-B", str(release / "github/deploy/reviewer_host.py"), "access-probe"],
                                              {"PATH": "/usr/bin:/bin"}, install["workingDirectory"], role["uid"], role["gid"], json.dumps(operations).encode()))
        if observed != [{"id": p["id"], "allowed": False} for p in operations]:
            raise ValueError("Role access probe failed")
        custody.append({"role": role_name, "uid": role["uid"], "results": observed})
    no_auth = proof_invocation(install, "access-probe", [{"id": "proof-auth", "path": str(root / "code/codex-home/auth.json"), "operation": "read"}])
    if strict_json(no_auth) != [{"id": "proof-auth", "allowed": False}]:
        raise ValueError("Proof worker can read authentication")
    outputs = [json.dumps({"codex": install["codexDigest"], "node": install["nodeDigest"]}).encode(),
               install["configurationDigest"].encode(), json.dumps(custody).encode(), confinement, no_auth]
    now = int(time.time() * 1000)
    runtime = {"schemaVersion": 1, "policyDigest": digest(policy_raw), "workerHostId": pilot["reviewerHostId"], "executorHostId": pilot["proofHostId"],
               "runtime": "0.151.0", "binaryDigest": install["codexDigest"], "configurationDigest": install["configurationDigest"],
               "checkedAt": now, "expiresAt": min(now + 1800000, pilot["expiresAt"]), "terminationConfirmed": True,
               "checks": [dict(command, exitCode=0, outputDigest=digest(output)) for command, output in zip(commands, outputs)]}
    proof_raw = json.dumps(proof, separators=(",", ":")).encode()
    runtime_raw = json.dumps(runtime, separators=(",", ":")).encode()
    binding = {"repositoryId": target["repositoryId"], "pullNumber": target["pullNumber"], "baseSha": target["baseSha"], "headSha": target["headSha"],
               "contractDigest": proof["contractDigest"], "proofDigest": digest(proof_raw), "policyDigest": digest(policy_raw), "model": "gpt-6-astra", "effort": "xhigh",
               "reviewerHostId": pilot["reviewerHostId"], "authorHostId": pilot["authorHostId"]}
    candidate = {"schemaVersion": 2, "binding": binding, "sourceDigest": source["sourceDigest"], "contractText": pilot["contractText"],
                 "sourceText": source["sourceText"], "runtimeProofDigest": digest(runtime_raw)}
    if current_pilot(install)[1] != pilot_raw:
        raise ValueError("Pilot changed during proof")
    for name, raw in [("policy.json", policy_raw), (digest(proof_raw) + ".proof.json", proof_raw), (digest(runtime_raw) + ".runtime-proof.json", runtime_raw),
                      (pilot["requestId"] + ".candidate.json", json.dumps(candidate, separators=(",", ":")).encode())]:
        write_new(authority / name, raw, install["publisher"]["uid"])
    write_new(root / "proof" / (pilot["requestId"] + ".json"), json.dumps({"sourceProof": proof, "runtimeProof": runtime,
              "documentOutput": strict_json(proof_output), "custody": custody, "confinement": strict_json(confinement), "proofCredentialAccess": strict_json(no_auth)}).encode())
    return pilot


def run_pilot(install):
    root, release = Path(install["root"]), Path(install["release"])
    lock = root / "operator/pilot.lock"
    lock.mkdir(mode=0o700)  # Never evict by age or automatically retry uncertainty.
    completed = False
    try:
        pilot = prepare_candidate(install)
        worker = install["worker"]
        publisher = install["publisher"]
        clean_env = {"PATH": "/usr/bin:/bin", "HOME": install["workingDirectory"], "CODEX_HOME": install["codexHome"],
                     "TMPDIR": str(root / "worker/scratch"), "LANG": "en_US.UTF-8", "NO_COLOR": "1"}
        args = ["/usr/bin/sandbox-exec", "-f", str(root / "policy/worker.sb"), str(release / "bin/codex"), "app-server", "--listen", "stdio://"]
        result = supervise_worker(args, publisher_command(install, "audit"), clean_env,
                                  {"PATH": "/usr/bin:/bin", "HOME": str(root / "publisher")}, install["workingDirectory"],
                                  worker["uid"], publisher["uid"], worker["gid"], publisher["gid"])
        if strict_json(result).get("status") != "audit-recorded":
            raise ValueError("Missing protected audit")
        if pilot["publicationEnabled"]:
            publisher_invoke(install, "sign")
            result = publisher_invoke(install, "publish")
        write_new(root / "operator" / (pilot["requestId"] + ".result.json"), result)
        completed = True
        return strict_json(result)
    finally:
        if completed:
            lock.rmdir()


def login_worker(install):
    """Owner's interactive device login under the dedicated account only."""
    root = Path(install["root"])
    login = protected_path(root / "worker/login", install["worker"]["uid"], directory=True, private=True)
    if list(login.iterdir()) or (root / "code/codex-home/auth.json").exists():
        raise ValueError("Existing login requires separate owner recovery")
    worker = install["worker"]
    def identity():
        os.setgroups([])
        os.setgid(worker["gid"])
        os.setuid(worker["uid"])
        os.umask(0o077)
    command = [str(Path(install["release"]) / "bin/codex"), "login", "--device-auth"]
    check_stop()
    process = subprocess.Popen(command, cwd=install["workingDirectory"], env={"HOME": str(login), "CODEX_HOME": str(login), "PATH": "/usr/bin:/bin"},
                               preexec_fn=identity, start_new_session=True, close_fds=True)
    try:
        deadline = time.monotonic() + 600
        while process.poll() is None:
            check_stop()
            if time.monotonic() >= deadline:
                raise ValueError("Worker login deadline")
            time.sleep(0.05)
        check_stop()
        if process.returncode != 0:
            raise ValueError("Worker login did not complete")
    finally:
        if not drain(process):
            raise ValueError("Worker login drain remains uncertain")
    raw = checked_file(protected_path(login / "auth.json", worker["uid"], private=True), worker["uid"], 32768)
    if strict_json(raw).get("auth_mode") != "chatgpt":
        raise ValueError("Worker login is not ChatGPT")
    # Root-controlled parent prevents adding configs/plugins/instructions. The
    # short pilot uses this dedicated account's just-created auth; no home or
    # personal credentials are imported. Refresh failure safely stops the pilot.
    write_new(root / "code/codex-home/auth.json", raw, worker["uid"], 0o400)
    return {"status": "isolated-worker-login-prepared", "mergeAuthorized": False}


def disable_pilot(root):
    # Revocation must survive missing/broken worker state and native runtimes.
    # Only the owner and protected control-directory custody are prerequisites.
    if os.geteuid() != 0 or sys.platform != "darwin":
        raise ValueError("Protected revocation requires owner root")
    root = protected_path(root, directory=True)
    protected_path(root / "policy", directory=True)
    marker = root / "policy/PILOT-DISABLED"
    if not marker.exists():
        write_new(marker, b"Pilot disabled by operator\n", mode=0o444)
    protected_path(marker)
    return {"status": "pilot-disabled", "priorGitHubAcceptancesRevoked": False, "mergeAuthorized": False}


def install_stop_handlers():
    """Latch stops; bounded loops unwind only after child ownership is recorded.

    Raising inside a signal handler can interrupt Popen before its process is
    assigned. A latch closes that leak and repeated signals cannot interrupt
    finally drain. SIGKILL/host loss still requires owner recovery.
    """
    def stop(_number, _frame):
        global _stop_requested
        _stop_requested = True
    for number in (signal.SIGTERM, signal.SIGHUP, signal.SIGINT):
        signal.signal(number, stop)


def main():
    check_stop()
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    build = sub.add_parser("build")
    build.add_argument("--repository", required=True)
    build.add_argument("--output", required=True)
    install = sub.add_parser("install")
    for name in ["root", "package", "manifest-digest", "node", "node-digest", "codex", "codex-digest", "worker", "publisher", "author", "python"]:
        install.add_argument("--" + name, required=True)
    for command in ["verify", "keygen", "login", "run", "sign", "publish", "inspect", "reconcile", "disable", "configure", "provision-app-key"]:
        item = sub.add_parser(command)
        item.add_argument("--root", required=True)
        if command == "configure":
            item.add_argument("--policy", required=True)
            item.add_argument("--digest", required=True)
        if command == "provision-app-key":
            item.add_argument("--source", required=True)
    for command in ["document-proof", "access-probe", "confinement-probe"]:
        sub.add_parser(command)
    args = parser.parse_args()
    if args.command in {"document-proof", "access-probe", "confinement-probe"}:
        raw = sys.stdin.buffer.read(600001)
        if len(raw) > 600000:
            raise ValueError("Oversized proof input")
        data = strict_json(raw)
        return {"document-proof": lambda: document_proof(data), "access-probe": lambda: probe_access(data), "confinement-probe": confinement_probe}[args.command]()
    if args.command == "build":
        return build_package(args.repository, args.output)
    if args.command == "install":
        return install_package(args.root, args.package, args.manifest_digest, args.node, args.node_digest,
                               args.codex, args.codex_digest, args.worker, args.publisher, args.author, args.python)
    if args.command == "disable":
        return disable_pilot(args.root)
    installed = verify_installation(args.root)
    root = Path(args.root)
    if args.command == "verify":
        return {"status": "custody-verified", "sourceCommit": installed["manifest"]["sourceCommit"], "manifestDigest": installed["manifestDigest"], "mergeAuthorized": False}
    if args.command == "configure":
        return configure_pilot(installed, args.policy, args.digest)
    if args.command == "provision-app-key":
        publisher = installed["publisher"]
        source = protected_path(args.source, publisher["uid"], private=True)
        if source == root / "publisher/app-key.pem":
            raise ValueError("Key destination is already provisioned")
        raw = checked_file(source, publisher["uid"], 16384)
        # Provisioning accepts only a file already protected from the author;
        # downloading a key into the author's home does not meet this boundary.
        write_new(root / "publisher/app-key.pem", raw, publisher["uid"])
        return {"status": "protected-app-key-provisioned", "mergeAuthorized": False}
    if args.command == "login":
        return login_worker(installed)
    if args.command == "run":
        return run_pilot(installed)
    return strict_json(publisher_invoke(installed, args.command))


if __name__ == "__main__":
    install_stop_handlers()
    try:
        print(json.dumps(main(), separators=(",", ":")))
    except Exception:
        print("Reviewer host rejected; preserve protected records and any operation lock for owner investigation.", file=sys.stderr)
        sys.exit(1)
