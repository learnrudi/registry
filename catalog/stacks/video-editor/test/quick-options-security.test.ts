import assert from 'node:assert/strict';
import test from 'node:test';
import { videoThumbnail } from '../src/quick-tools.js';

test('invalid timestamp is rejected at the tool boundary before reading files', async () => {
  await assert.rejects(() => videoThumbnail('/nonexistent-fixture.mp4', { time: '0; arbitrary' }), /time must be a timestamp/);
});

test('quick operations validate numeric, enum, and filter inputs before file access', async () => {
  const api = await import('../src/quick-tools.js');
  const invalid: Array<[string, Record<string, unknown>, RegExp]> = [
    ['videoTrim', { start: '0; arbitrary' }, /start must/],
    ['videoSpeed', { speed: '2,filter' }, /speed must/],
    ['videoExtractAudio', { format: '../mp3' }, /format must/],
    ['videoRemoveSilence', { threshold: '0,amovie=secret' }, /threshold must/],
    ['videoResize', { width: '20,filter' }, /width must/],
    ['videoCompress', { preset: 'medium; arbitrary' }, /preset must/],
    ['videoCompress', { maxBitrate: '1M; arbitrary' }, /maxBitrate must/],
    ['videoCompress', { crf: -1 }, /crf must/],
    ['videoFrames', { count: -1 }, /count must/],
    ['videoFrames', { format: '../jpg' }, /format must/],
    ['videoFrames', { timestamps: ['0; arbitrary'] }, /timestamps must/],
  ];
  for (const [name, options, expected] of invalid) {
    await assert.rejects(() => (api as any)[name]('/nonexistent-fixture.mp4', options), expected);
  }
});

test('frame-rate metadata is parsed as a ratio without evaluating code', async () => {
  const { parseFrameRate } = await import('../src/quick-validation.js');
  assert.equal(parseFrameRate('30000/1001'), 30000 / 1001);
  assert.equal(parseFrameRate('0/0'), 0);
  assert.equal(parseFrameRate('globalThis.__videoInjected = 1'), 0);
  assert.equal((globalThis as any).__videoInjected, undefined);
});

test('all quick media operations preserve metacharacters in local filenames', async () => {
  const { execFileSync } = await import('node:child_process');
  const { existsSync, mkdtempSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const api = await import('../src/quick-tools.js');
  const root = mkdtempSync(join(tmpdir(), "quick-'literal-"));
  const ffmpeg = existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg';
  try {
    const input = join(root, 'input-$(printf injected).mp4');
    execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=32x32:d=1', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', input]);
    assert.ok((await api.videoInfo(input)).includes('input-$(printf injected).mp4'));
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ['videoTrim', { duration: '0.5' }, '.mp4'],
      ['videoSpeed', { speed: 2 }, '.mp4'],
      ['videoExtractAudio', { format: 'wav' }, '.wav'],
      ['videoResize', { width: 16 }, '.mp4'],
      ['videoCompress', { crf: 23, preset: 'fast' }, '.mp4'],
      ['videoFrames', { count: 1 }, ''],
      ['videoExtractSlides', { interval: 0.5, width: 32 }, ''],
      ['videoThumbnail', { time: '0' }, '.jpg'],
      ['videoConcat', {}, '.mp4'],
    ];
    for (const [name, options, extension] of cases) {
      const output = join(root, `${name}-$(printf injected)${extension}`);
      await (api as any)[name](name === 'videoConcat' ? [input, input] : input, { ...options, output });
      assert.ok(existsSync(output), name);
    }
    const silence = await api.videoRemoveSilence(input, { threshold: '-60dB' });
    assert.ok(silence.includes('No Silence Detected'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
