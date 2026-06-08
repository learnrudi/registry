import assert from 'node:assert/strict';
import { findSegmentsByKeywords, parseTimestamp, parseTranscript } from '../src/operations/clips.js';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

async function withTempTranscript(content, callback) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rudi-video-test-'));
  const transcriptPath = path.join(tempDir, 'transcript.txt');
  await fs.writeFile(transcriptPath, content, 'utf8');

  try {
    return await callback(transcriptPath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

assert.equal(parseTimestamp('(05:30)'), 330);
assert.equal(parseTimestamp('[01:05:30]'), 3930);
assert.equal(parseTimestamp('00:00'), 0);
assert.equal(parseTimestamp('01:02.500'), 62.5);
assert.equal(parseTimestamp('invalid'), null);
assert.equal(parseTimestamp('01:99'), null);

await withTempTranscript(`
Title
https://example.com/video
Transcript:

(00:05) First segment about artificial intelligence.
(00:15) Second segment about gardening.
[00:25] Third segment about AI safety.
`, async (transcriptPath) => {
  const segments = await parseTranscript(transcriptPath);
  assert.equal(segments.length, 3);
  assert.equal(segments[0].startTime, 5);
  assert.equal(segments[0].endTime, 15);
  assert.equal(segments[2].endTime, null);

  const matches = await findSegmentsByKeywords(transcriptPath, ['AI', 'artificial intelligence']);
  assert.equal(matches.length, 2);
});

console.log('clips tests passed');
