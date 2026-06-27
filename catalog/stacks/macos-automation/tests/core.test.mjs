import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyMacosError,
  createReminder,
  getSelectedFinderItems,
  parseOpenUrlArgs,
  parseReminderArgs,
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
