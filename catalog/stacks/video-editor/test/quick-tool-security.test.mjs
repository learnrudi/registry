import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const ffmpeg = existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg';
test('thumbnail treats shell substitution in output filename as literal data', () => {
  const root = mkdtempSync(join(tmpdir(), 'video-security-'));
  try {
    const input = join(root, 'input.mp4');
    const output = join(root, 'thumb-$(printf injected).jpg');
    execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=32x32:d=1', '-c:v', 'libx264', input]);
    execFileSync(process.execPath, ['--import', 'tsx', 'src/index.ts', 'thumbnail', input, '--output', output], { stdio: 'pipe' });
    assert.equal(existsSync(output), true);
    assert.equal(existsSync(join(root, 'thumb-injected.jpg')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CLI accepts numeric-second trim and thumbnail timestamps', () => {
  const root = mkdtempSync(join(tmpdir(), 'video-cli-time-'));
  try {
    const input = join(root, 'input.mp4');
    execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=32x32:d=1', '-c:v', 'libx264', input]);
    const trimmed = join(root, 'trim.mp4');
    execFileSync(process.execPath, ['--import', 'tsx', 'src/index.ts', 'trim', input, '--start', '0', '--duration', '0.5', '--output', trimmed], { stdio: 'pipe' });
    const thumbnail = join(root, 'thumb.jpg');
    execFileSync(process.execPath, ['--import', 'tsx', 'src/index.ts', 'thumbnail', input, '--time', '0.2', '--output', thumbnail], { stdio: 'pipe' });
    assert.ok(existsSync(trimmed)); assert.ok(existsSync(thumbnail));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
