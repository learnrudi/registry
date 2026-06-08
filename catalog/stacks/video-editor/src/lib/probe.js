// Helpers for working with ffprobe output.
// Centralizes stream-finding + summarization so the shape of the probe
// JSON is interpreted in one place across the stack.

import { parseFrameRate } from './format.js';

export { parseFrameRate };

export function getVideoStream(probe) {
  return probe?.streams?.find((s) => s.codec_type === 'video') || null;
}

export function getAudioStream(probe) {
  return probe?.streams?.find((s) => s.codec_type === 'audio') || null;
}

function gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { [a, b] = [b, a % b]; }
  return a || 1;
}

export function aspectRatio(width, height) {
  if (!width || !height) return null;
  const g = gcd(width, height);
  return `${width / g}:${height / g}`;
}

export function orientationFromDims(width, height) {
  if (!width || !height) return null;
  if (width > height) return 'horizontal';
  if (height > width) return 'vertical';
  return 'square';
}

// Produce a rich, normalized summary of a probe artifact — duration, codec,
// dimensions, fps, audio metadata. Used by `about` for human display and by
// the Remotion composer for metadata-driven rendering.
export function summarizeProbe(probe) {
  const v = getVideoStream(probe);
  const a = getAudioStream(probe);
  const format = probe?.format || {};
  const duration = Number.parseFloat(format.duration || v?.duration || '0');
  const fps = v ? parseFrameRate(v.r_frame_rate) : null;
  const avgFps = v ? parseFrameRate(v.avg_frame_rate) : null;
  const ar = v ? aspectRatio(v.width, v.height) : null;
  return {
    duration,
    fileSize: Number.parseInt(format.size || '0', 10) || null,
    bitrate: Number.parseInt(format.bit_rate || '0', 10) || null,
    container: format.format_name || null,
    video: v ? {
      codec: v.codec_name,
      profile: v.profile,
      width: v.width,
      height: v.height,
      pixelFormat: v.pix_fmt,
      colorSpace: v.color_space,
      fps,
      avgFps,
      frames: v.nb_frames ? Number.parseInt(v.nb_frames, 10) : null,
      startTime: Number.parseFloat(v.start_time || '0'),
      orientation: orientationFromDims(v.width, v.height),
      aspectRatio: ar
    } : null,
    audio: a ? {
      codec: a.codec_name,
      sampleRate: a.sample_rate ? Number.parseInt(a.sample_rate, 10) : null,
      channels: a.channels || null,
      channelLayout: a.channel_layout || null,
      startTime: Number.parseFloat(a.start_time || '0')
    } : null
  };
}
