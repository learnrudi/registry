import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { runCommand } from '../lib/process.js';

function assertFiniteTime(name, value) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite non-negative number`);
  }
}

function formatClock(seconds) {
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function slugify(value, fallback) {
  const slug = String(value)
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return slug || fallback;
}

function escapeConcatPath(filePath) {
  return `'${path.resolve(filePath).replaceAll("'", "'\\''")}'`;
}

export function parseTimestamp(timestamp) {
  const cleaned = String(timestamp).replace(/[()[\]]/g, '').trim();
  const match = cleaned.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/);
  if (!match) {
    return null;
  }

  const hours = match[1] ? Number.parseInt(match[1], 10) : 0;
  const minutes = Number.parseInt(match[2], 10);
  const seconds = Number.parseInt(match[3], 10);
  const millis = match[4] ? Number.parseInt(match[4].padEnd(3, '0'), 10) : 0;

  if (minutes > 59 && hours > 0) {
    return null;
  }

  if (seconds > 59) {
    return null;
  }

  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

export async function parseTranscript(transcriptPath) {
  const content = await fs.readFile(transcriptPath, 'utf8');
  const lines = content.split(/\r?\n/);
  const segments = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line === 'Transcript:' || /^https?:\/\//i.test(line)) {
      continue;
    }

    const timestampMatch = line.match(/^(\(?\[?\d{1,2}(?::\d{1,2})?:\d{2}(?:\.\d{1,3})?\]?\)?)/);
    if (timestampMatch) {
      if (current) {
        segments.push(current);
      }

      const startTime = parseTimestamp(timestampMatch[1]);
      if (startTime === null) {
        continue;
      }

      current = {
        startTime,
        endTime: null,
        text: line.slice(timestampMatch[1].length).trim(),
        originalLine: line
      };
      continue;
    }

    if (current) {
      current.text = `${current.text} ${line}`.trim();
    }
  }

  if (current) {
    segments.push(current);
  }

  for (let index = 0; index < segments.length; index += 1) {
    segments[index].endTime = index < segments.length - 1
      ? segments[index + 1].startTime
      : null;
  }

  return segments;
}

export async function getVideoInfo(videoPath) {
  const { stdout } = await runCommand('ffprobe', [
    '-v',
    'error',
    '-show_format',
    '-show_streams',
    '-of',
    'json',
    videoPath
  ], { capture: true });

  const probe = JSON.parse(stdout);
  const duration = Number.parseFloat(probe.format?.duration || '0');
  const video = Array.isArray(probe.streams)
    ? probe.streams.find((stream) => stream.codec_type === 'video')
    : null;
  const audio = Array.isArray(probe.streams)
    ? probe.streams.find((stream) => stream.codec_type === 'audio')
    : null;

  return {
    path: videoPath,
    duration: Number.isFinite(duration) ? duration : 0,
    format: probe.format?.format_name || null,
    video: video ? {
      codec: video.codec_name || null,
      width: video.width || null,
      height: video.height || null,
      frameRate: video.r_frame_rate || null
    } : null,
    audio: audio ? {
      codec: audio.codec_name || null,
      sampleRate: audio.sample_rate || null,
      channels: audio.channels || null
    } : null
  };
}

export async function getVideoDuration(videoPath) {
  const info = await getVideoInfo(videoPath);
  return info.duration;
}

export async function createClip(videoPath, startTime, endTime, outputPath) {
  assertFiniteTime('startTime', startTime);
  assertFiniteTime('endTime', endTime);

  const duration = endTime - startTime;
  if (duration <= 0) {
    throw new Error(`Invalid clip range: start=${startTime}, end=${endTime}`);
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const coarseStart = Math.max(0, startTime - 1);
  const fineStart = startTime - coarseStart;

  await runCommand('ffmpeg', [
    '-hide_banner',
    '-y',
    '-ss',
    coarseStart.toFixed(3),
    '-i',
    videoPath,
    '-ss',
    fineStart.toFixed(3),
    '-t',
    duration.toFixed(3),
    '-c:v',
    'libx264',
    '-crf',
    '20',
    '-preset',
    'medium',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-fflags',
    '+genpts',
    '-avoid_negative_ts',
    'make_zero',
    '-movflags',
    '+faststart',
    outputPath
  ]);

  return outputPath;
}

async function writeClipSummary(outputDir, summary) {
  const jsonPath = path.join(outputDir, 'clips-summary.json');
  const textPath = path.join(outputDir, 'clips-summary.txt');
  const text = [
    'Video Clips Summary',
    `Source: ${path.basename(summary.source)}`,
    `Transcript: ${path.basename(summary.transcript)}`,
    '',
    ...summary.clips.flatMap((clip) => [
      `Clip ${clip.index}: ${path.basename(clip.file)}`,
      `  Time: ${formatClock(clip.startTime)} - ${formatClock(clip.endTime)}`,
      `  Text: ${clip.text}`,
      ''
    ])
  ].join('\n');

  await fs.writeFile(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  await fs.writeFile(textPath, text, 'utf8');
  return { jsonPath, textPath };
}

export async function createTranscriptClips(videoPath, transcriptPath, outputDir) {
  const segments = await parseTranscript(transcriptPath);
  const videoDuration = await getVideoDuration(videoPath);
  await fs.mkdir(outputDir, { recursive: true });

  const clips = [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const endTime = segment.endTime ?? videoDuration;
    if (endTime <= segment.startTime) {
      continue;
    }

    const clipName = `segment-${String(index + 1).padStart(2, '0')}-${slugify(formatClock(segment.startTime), 'clip')}.mp4`;
    const outputPath = path.join(outputDir, clipName);
    await createClip(videoPath, segment.startTime, endTime, outputPath);
    clips.push({
      index: clips.length + 1,
      file: outputPath,
      startTime: segment.startTime,
      endTime,
      text: segment.text
    });
  }

  const summary = {
    source: videoPath,
    transcript: transcriptPath,
    totalClips: clips.length,
    clips
  };
  const summaryFiles = await writeClipSummary(outputDir, summary);
  return { ...summary, summaryFiles };
}

export async function findSegmentsByKeywords(transcriptPath, keywords) {
  const normalizedKeywords = keywords
    .map((keyword) => String(keyword).trim().toLowerCase())
    .filter(Boolean);
  const segments = await parseTranscript(transcriptPath);

  return segments.filter((segment) => {
    const text = segment.text.toLowerCase();
    return normalizedKeywords.some((keyword) => text.includes(keyword));
  });
}

export async function createTopicClips(videoPath, transcriptPath, keywords, outputDir) {
  const matchingSegments = await findSegmentsByKeywords(transcriptPath, keywords);
  const videoDuration = await getVideoDuration(videoPath);
  await fs.mkdir(outputDir, { recursive: true });

  const keywordSlug = slugify(keywords.join('-'), 'topic');
  const clips = [];

  for (const segment of matchingSegments) {
    const endTime = segment.endTime ?? videoDuration;
    if (endTime <= segment.startTime) {
      continue;
    }

    const outputPath = path.join(outputDir, `${keywordSlug}-${String(clips.length + 1).padStart(2, '0')}.mp4`);
    await createClip(videoPath, segment.startTime, endTime, outputPath);
    clips.push({
      index: clips.length + 1,
      file: outputPath,
      startTime: segment.startTime,
      endTime,
      text: segment.text,
      keywords
    });
  }

  const summary = {
    source: videoPath,
    transcript: transcriptPath,
    keywords,
    totalClips: clips.length,
    clips
  };
  const summaryFiles = await writeClipSummary(outputDir, summary);
  return { ...summary, summaryFiles };
}

export async function trimVideo(videoPath, startTime, endTime, outputPath) {
  return createClip(videoPath, startTime, endTime, outputPath);
}

export async function extractAudio(videoPath, outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const extension = path.extname(outputPath).toLowerCase();
  const args = ['-hide_banner', '-y', '-i', videoPath, '-vn'];

  if (extension === '.mp3') {
    args.push('-codec:a', 'libmp3lame', '-q:a', '2');
  } else if (extension === '.m4a' || extension === '.aac') {
    args.push('-codec:a', 'aac', '-b:a', '192k');
  } else if (extension === '.wav') {
    args.push('-codec:a', 'pcm_s16le');
  } else {
    args.push('-q:a', '0');
  }

  args.push(outputPath);
  await runCommand('ffmpeg', args);
  return outputPath;
}

export async function concatenateVideos(videoPaths, outputPath) {
  if (!Array.isArray(videoPaths) || videoPaths.length === 0) {
    throw new Error('At least one input video is required');
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rudi-video-concat-'));
  const listPath = path.join(tempDir, 'inputs.txt');
  await fs.writeFile(
    listPath,
    `${videoPaths.map((videoPath) => `file ${escapeConcatPath(videoPath)}`).join('\n')}\n`,
    'utf8'
  );

  try {
    try {
      await runCommand('ffmpeg', [
        '-hide_banner',
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listPath,
        '-c',
        'copy',
        '-movflags',
        '+faststart',
        outputPath
      ]);
    } catch {
      await runCommand('ffmpeg', [
        '-hide_banner',
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listPath,
        '-c:v',
        'libx264',
        '-c:a',
        'aac',
        '-movflags',
        '+faststart',
        outputPath
      ]);
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  return outputPath;
}
