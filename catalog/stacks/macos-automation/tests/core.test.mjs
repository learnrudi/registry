import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildLaunchAgentPlist,
  classifyMacosError,
  createReminder,
  getSelectedFinderItems,
  installLaunchAgent,
  listLaunchAgents,
  parseOpenUrlArgs,
  parseReminderArgs,
  parseInstallLaunchAgentArgs,
  parseLaunchAgentLabelArgs,
  removeLaunchAgent,
  runLaunchAgentNow,
  parseShortcutArgs,
  runShortcut,
} from "../dist/core.js";

function makeRunner(result = { stdout: "", stderr: "", exitCode: 0 }) {
  const calls = [];
  return {
    calls,
    runner: {
      execFile: async (file, args, options) => {
        calls.push({ file, args, options });
        return result;
      },
    },
  };
}

test("open URL args only allow http and https URLs", () => {
  assert.deepEqual(parseOpenUrlArgs({ url: "https://example.com/path" }), {
    url: "https://example.com/path",
  });

  assert.throws(() => parseOpenUrlArgs({ url: "javascript:alert(1)" }), /http or https/);
  assert.throws(() => parseOpenUrlArgs({ url: "x-apple.systempreferences:Security" }), /http or https/);
});

test("shortcut execution dry-runs unless explicitly confirmed", async () => {
  const input = parseShortcutArgs({
    name: "Prepare Content Workspace",
    input_path: "/tmp/source.mov",
  });
  const { calls, runner } = makeRunner();

  const result = await runShortcut(input, { runner });

  assert.equal(result.ran, false);
  assert.equal(result.dry_run, true);
  assert.equal(result.shortcut, "Prepare Content Workspace");
  assert.equal(calls.length, 0);
});

test("confirmed shortcut execution uses the shortcuts CLI without a shell", async () => {
  const input = parseShortcutArgs({
    name: "Prepare Content Workspace",
    input_path: "/tmp/source.mov",
    output_path: "/tmp/out.txt",
    confirm_run: true,
  });
  const { calls, runner } = makeRunner({ stdout: "done\n", stderr: "", exitCode: 0 });

  const result = await runShortcut(input, { runner });

  assert.equal(result.ran, true);
  assert.equal(result.stdout, "done");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, "/usr/bin/shortcuts");
  assert.deepEqual(calls[0].args, [
    "run",
    "Prepare Content Workspace",
    "--input-path",
    "/tmp/source.mov",
    "--output-path",
    "/tmp/out.txt",
  ]);
});

test("reminder creation validates and normalizes due_at", async () => {
  const input = parseReminderArgs({
    title: "Shoot the product demo",
    notes: "Capture vertical and landscape takes.",
    list_name: "RUDI",
    due_at: "2026-06-27T14:30:00-04:00",
  });

  assert.equal(input.title, "Shoot the product demo");
  assert.deepEqual(input.due_date_parts, {
    year: 2026,
    month: 6,
    day: 27,
    seconds_since_midnight: 52200,
  });

  const { calls, runner } = makeRunner();
  const result = await createReminder(input, { runner });

  assert.equal(result.created, false);
  assert.equal(result.dry_run, true);
  assert.equal(calls.length, 0);
});

test("confirmed reminder creation passes user values as osascript argv", async () => {
  const input = parseReminderArgs({
    title: "Follow up with prospect",
    notes: "Send the short proposal.",
    list_name: "Business",
    due_at: "2026-06-27T10:00:00-04:00",
    confirm_create: true,
  });
  const { calls, runner } = makeRunner({ stdout: "x-apple-reminder://123\n", stderr: "", exitCode: 0 });

  const result = await createReminder(input, { runner });

  assert.equal(result.created, true);
  assert.equal(result.id, "x-apple-reminder://123");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, "/usr/bin/osascript");
  assert.ok(calls[0].args.includes("tell application \"Reminders\""));
  assert.deepEqual(calls[0].args.slice(-8), [
    "Follow up with prospect",
    "Send the short proposal.",
    "Business",
    "true",
    "2026",
    "6",
    "27",
    "36000",
  ]);
});

test("Finder selection parser returns newline-delimited POSIX paths", async () => {
  const { runner } = makeRunner({
    stdout: "/tmp/rudi-a.mov\n/tmp/rudi-b.mov\n",
    stderr: "",
    exitCode: 0,
  });

  const result = await getSelectedFinderItems({ runner });

  assert.deepEqual(result.paths, [
    "/tmp/rudi-a.mov",
    "/tmp/rudi-b.mov",
  ]);
});

test("macOS permission errors are classified with a usable remediation", () => {
  const classified = classifyMacosError({
    stderr: "System Events got an error: osascript is not allowed assistive access. (-25211)",
    exitCode: 1,
  });

  assert.equal(classified.kind, "permission");
  assert.match(classified.message, /Accessibility/);
  assert.match(classified.remediation, /System Settings/);
});

test("LaunchAgent install args validate label scope, command, and daily schedule", () => {
  const input = parseInstallLaunchAgentArgs({
    label: "dev.rudi.daily-brief",
    command: ["/usr/bin/shortcuts", "run", "Daily Brief"],
    schedule: { type: "daily", hour: 8, minute: 30 },
    run_at_load: true,
  });

  assert.equal(input.label, "dev.rudi.daily-brief");
  assert.deepEqual(input.command, ["/usr/bin/shortcuts", "run", "Daily Brief"]);
  assert.deepEqual(input.schedule, { type: "daily", hour: 8, minute: 30 });
  assert.equal(input.run_at_load, true);
  assert.equal(input.confirm_install, false);

  assert.throws(
    () => parseInstallLaunchAgentArgs({
      label: "com.apple.bad-idea",
      command: ["/bin/echo", "hello"],
      schedule: { type: "interval", seconds: 300 },
    }),
    /dev\.rudi/
  );

  assert.throws(
    () => parseInstallLaunchAgentArgs({
      label: "dev.rudi.shell",
      command: ["sh", "-c", "echo unsafe"],
      schedule: { type: "interval", seconds: 300 },
    }),
    /absolute path/
  );
});

test("LaunchAgent plist escapes user values and models interval schedules", () => {
  const input = parseInstallLaunchAgentArgs({
    label: "dev.rudi.content-sync",
    command: ["/bin/echo", "a & b", "<done>"],
    schedule: { type: "interval", seconds: 900 },
    stdout_path: "/tmp/rudi launchd/out.log",
    stderr_path: "/tmp/rudi launchd/err.log",
  });

  const plist = buildLaunchAgentPlist(input);

  assert.match(plist, /<key>Label<\/key>\s*<string>dev\.rudi\.content-sync<\/string>/);
  assert.match(plist, /<key>StartInterval<\/key>\s*<integer>900<\/integer>/);
  assert.match(plist, /a &amp; b/);
  assert.match(plist, /&lt;done&gt;/);
  assert.match(plist, /<key>StandardOutPath<\/key>/);
});

test("LaunchAgent install dry-runs without writing or loading", async () => {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "rudi-launchd-home-"));
  const { calls, runner } = makeRunner();
  const input = parseInstallLaunchAgentArgs({
    label: "dev.rudi.dry-run",
    command: ["/bin/echo", "hello"],
    schedule: { type: "interval", seconds: 600 },
  });

  const result = await installLaunchAgent(input, { runner, homeDir });

  assert.equal(result.installed, false);
  assert.equal(result.dry_run, true);
  assert.match(result.plist, /dev\.rudi\.dry-run/);
  assert.equal(calls.length, 0);

  await assert.rejects(
    () => fs.stat(path.join(homeDir, "Library/LaunchAgents/dev.rudi.dry-run.plist")),
    /ENOENT/
  );
});

test("confirmed LaunchAgent install writes plist and can bootstrap", async () => {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "rudi-launchd-home-"));
  const { calls, runner } = makeRunner();
  const input = parseInstallLaunchAgentArgs({
    label: "dev.rudi.installed",
    command: ["/bin/echo", "hello"],
    schedule: { type: "daily", hour: 9, minute: 15 },
    load_now: true,
    confirm_install: true,
  });

  const result = await installLaunchAgent(input, { runner, homeDir, uid: 501 });

  assert.equal(result.installed, true);
  assert.equal(result.loaded, true);
  assert.equal(result.path, path.join(homeDir, "Library/LaunchAgents/dev.rudi.installed.plist"));
  assert.deepEqual(calls[0], {
    file: "/bin/launchctl",
    args: ["bootstrap", "gui/501", result.path],
    options: { timeoutMs: 15000, input: undefined },
  });
  assert.match(await fs.readFile(result.path, "utf8"), /dev\.rudi\.installed/);
});

test("LaunchAgent remove dry-runs and confirmed remove unloads then deletes", async () => {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "rudi-launchd-home-"));
  const launchAgents = path.join(homeDir, "Library/LaunchAgents");
  await fs.mkdir(launchAgents, { recursive: true });
  const plistPath = path.join(launchAgents, "dev.rudi.cleanup.plist");
  await fs.writeFile(plistPath, "<plist />");
  const { calls, runner } = makeRunner({ stdout: "", stderr: "", exitCode: 0 });

  const dryRun = await removeLaunchAgent(
    parseLaunchAgentLabelArgs({ label: "dev.rudi.cleanup" }),
    { runner, homeDir, uid: 501 }
  );
  assert.equal(dryRun.removed, false);
  assert.equal(await fs.readFile(plistPath, "utf8"), "<plist />");

  const removed = await removeLaunchAgent(
    parseLaunchAgentLabelArgs({ label: "dev.rudi.cleanup", confirm_remove: true }),
    { runner, homeDir, uid: 501 }
  );
  assert.equal(removed.removed, true);
  assert.deepEqual(calls[0].args, ["bootout", "gui/501", plistPath]);
  await assert.rejects(() => fs.stat(plistPath), /ENOENT/);
});

test("LaunchAgent run-now dry-runs unless explicitly confirmed", async () => {
  const { calls, runner } = makeRunner();
  const dryRun = await runLaunchAgentNow(
    parseLaunchAgentLabelArgs({ label: "dev.rudi.daily-brief" }),
    { runner, uid: 501 }
  );
  assert.equal(dryRun.started, false);
  assert.equal(calls.length, 0);

  const started = await runLaunchAgentNow(
    parseLaunchAgentLabelArgs({ label: "dev.rudi.daily-brief", confirm_run: true }),
    { runner, uid: 501 }
  );
  assert.equal(started.started, true);
  assert.deepEqual(calls[0].args, ["kickstart", "-k", "gui/501/dev.rudi.daily-brief"]);
});

test("LaunchAgent list only returns dev.rudi plist files", async () => {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "rudi-launchd-home-"));
  const launchAgents = path.join(homeDir, "Library/LaunchAgents");
  await fs.mkdir(launchAgents, { recursive: true });
  await fs.writeFile(path.join(launchAgents, "dev.rudi.one.plist"), "<plist />");
  await fs.writeFile(path.join(launchAgents, "com.other.agent.plist"), "<plist />");

  const result = await listLaunchAgents({ homeDir });

  assert.deepEqual(result.agents, [
    {
      label: "dev.rudi.one",
      path: path.join(launchAgents, "dev.rudi.one.plist"),
    },
  ]);
});
