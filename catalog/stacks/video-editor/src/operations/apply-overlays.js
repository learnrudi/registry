import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getVideoInfo } from './clips.js';
import { formatSeconds, roundTime } from '../lib/format.js';
import { runCommand } from '../lib/process.js';
import { validateJsonSchema } from '../lib/json-schema.js';

const videoEditorRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

const applyOverlaysSchemaPath = path.join(videoEditorRoot, 'schemas', 'apply-overlays.schema.json');
const DEFAULT_TRANSITION = 'fade';
const DEFAULT_FADE_SECONDS = 0.3;
const EPSILON_SECONDS = 0.01;
const DEFAULT_PIP_SIZE = 260;
const DEFAULT_PIP_MARGIN = 56;
const DEFAULT_PIP_SHAPE = 'circle';
const DEFAULT_PIP_POSITION = 'top-right';
const DEFAULT_PIP_SHOW = 'during_overlays';

const PIP_DEFAULTS = {
  shape: 'circle',
  size: 260,
  position: 'top-right',
  margin: 56,
  show: 'during_overlays',
  exclude_overlay_indexes: []
};

const FORMAT_DIMENSIONS = {
  story: { width: 1080, height: 1920 },
  portrait: { width: 1080, height: 1350 },
  landscape: { width: 1920, height: 1080 },
  square: { width: 1080, height: 1080 }
};

let applyOverlaysSchema = null;

async function loadApplyOverlaysSchema() {
  if (applyOverlaysSchema) {
    return applyOverlaysSchema;
  }

  const content = await fs.readFile(applyOverlaysSchemaPath, 'utf8');
  applyOverlaysSchema = JSON.parse(content);
  return applyOverlaysSchema;
}

async function assertReadableFile(filePath, label) {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      throw new Error(`${label} must be a file: ${filePath}`);
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`${label} not found: ${filePath}`);
    }
    throw error;
  }
}

async function probeImageDimensions(imagePath) {
  const { stdout } = await runCommand('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height',
    '-of',
    'json',
    imagePath
  ], { capture: true });

  const probe = JSON.parse(stdout);
  const stream = Array.isArray(probe.streams) ? probe.streams[0] : null;
  const width = Number(stream?.width);
  const height = Number(stream?.height);

  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error(`Could not read image dimensions: ${imagePath}`);
  }

  return { width, height };
}

async function readApplyOverlaysRequest(inputArg) {
  if (!inputArg) {
    throw new Error('Usage: apply-overlays <request.json|json>');
  }

  const trimmed = String(inputArg).trim();
  const text = trimmed.startsWith('{')
    ? trimmed
    : await fs.readFile(path.resolve(inputArg), 'utf8');

  return JSON.parse(text);
}

function normalizePath(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} is required`);
  }
  return path.resolve(value);
}

function normalizeTime(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a finite non-negative number`);
  }
  return roundTime(parsed);
}

function normalizePositiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function normalizeNonNegativeInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return parsed;
}

export function getFormatDimensions(format = 'story') {
  const dimensions = FORMAT_DIMENSIONS[format];
  if (!dimensions) {
    throw new Error(`Unknown output format: ${format}`);
  }
  return { ...dimensions };
}

function validateImageDimensions(overlays, imageDimensions, format, outputDimensions) {
  if (!Array.isArray(imageDimensions) || imageDimensions.length !== overlays.length) {
    throw new Error('imageDimensions must contain one entry for each overlay');
  }

  overlays.forEach((overlay, index) => {
    const dims = imageDimensions[index];
    if (dims?.width !== outputDimensions.width || dims?.height !== outputDimensions.height) {
      throw new Error(
        `Overlay image at index ${index} must match ${format} output dimensions `
        + `${outputDimensions.width}x${outputDimensions.height}; got ${dims?.width || '?'}x${dims?.height || '?'}`
      );
    }

    overlay.width = dims.width;
    overlay.height = dims.height;
  });
}

function validateOverlayTiming(overlays, duration) {
  let previousEnd = 0;

  overlays.forEach((overlay, index) => {
    if (overlay.end <= overlay.start) {
      throw new Error(`Overlay at index ${index} must end after it starts`);
    }

    if (overlay.start < previousEnd - EPSILON_SECONDS) {
      throw new Error(`Overlay at index ${index} overlaps previous overlay`);
    }

    if (overlay.end > duration + EPSILON_SECONDS) {
      throw new Error(
        `Overlay at index ${index} extends past video duration (${formatSeconds(duration)}s)`
      );
    }

    previousEnd = overlay.end;
  });
}

function normalizePresenterPip(inputPip, options) {
  if (!inputPip || inputPip.enabled !== true) {
    return null;
  }

  const shape = inputPip.shape || DEFAULT_PIP_SHAPE;
  if (shape !== 'circle') {
    throw new Error(`Unsupported presenter_pip.shape: ${shape}`);
  }

  const position = inputPip.position || DEFAULT_PIP_POSITION;
  if (!['top-right', 'top-left', 'bottom-right', 'bottom-left'].includes(position)) {
    throw new Error(`Unsupported presenter_pip.position: ${position}`);
  }

  const show = inputPip.show || DEFAULT_PIP_SHOW;
  if (show !== DEFAULT_PIP_SHOW) {
    throw new Error(`Unsupported presenter_pip.show: ${show}`);
  }

  const size = normalizePositiveInteger(inputPip.size ?? DEFAULT_PIP_SIZE, 'presenter_pip.size');
  const margin = normalizeNonNegativeInteger(inputPip.margin ?? DEFAULT_PIP_MARGIN, 'presenter_pip.margin');
  const cropInput = inputPip.crop;
  if (!cropInput || typeof cropInput !== 'object' || Array.isArray(cropInput)) {
    throw new Error('presenter_pip.crop is required when presenter_pip.enabled is true');
  }

  const crop = {
    x: normalizeNonNegativeInteger(cropInput.x, 'presenter_pip.crop.x'),
    y: normalizeNonNegativeInteger(cropInput.y, 'presenter_pip.crop.y'),
    width: normalizePositiveInteger(cropInput.width, 'presenter_pip.crop.width'),
    height: normalizePositiveInteger(cropInput.height, 'presenter_pip.crop.height')
  };

  if (crop.width !== crop.height) {
    throw new Error('presenter_pip.crop must be square for circle PIP');
  }

  if (size + margin * 2 > options.outputDimensions.width || size + margin * 2 > options.outputDimensions.height) {
    throw new Error('presenter_pip.size and margin do not fit inside output dimensions');
  }

  if (options.videoDimensions) {
    const videoWidth = Number(options.videoDimensions.width);
    const videoHeight = Number(options.videoDimensions.height);
    if (crop.x + crop.width > videoWidth || crop.y + crop.height > videoHeight) {
      throw new Error(
        `presenter_pip.crop extends beyond source video dimensions ${videoWidth}x${videoHeight}`
      );
    }
  }

  return {
    enabled: true,
    shape,
    size,
    position,
    margin,
    show,
    crop
  };
}

export function normalizeOverlayRequest(input, options = {}) {
  const format = input?.format || 'story';
  const outputDimensions = getFormatDimensions(format);
  const videoPath = normalizePath(input?.video_path, 'video_path');
  const outputPath = normalizePath(input?.output_path, 'output_path');

  if (path.resolve(videoPath) === path.resolve(outputPath)) {
    throw new Error('output_path must be different from video_path');
  }

  if (!outputPath.toLowerCase().endsWith('.mp4')) {
    throw new Error('output_path must end with .mp4');
  }

  if (!Array.isArray(input?.overlays) || input.overlays.length === 0) {
    throw new Error('overlays must contain at least one overlay');
  }

  const overlays = input.overlays.map((overlay, index) => {
    const imagePath = normalizePath(overlay?.image_path, `overlays[${index}].image_path`);
    const start = normalizeTime(overlay?.start, `overlays[${index}].start`);
    const end = normalizeTime(overlay?.end, `overlays[${index}].end`);
    const transition = overlay?.transition || DEFAULT_TRANSITION;

    if (transition !== 'fade' && transition !== 'cut') {
      throw new Error(`Unsupported overlay transition at index ${index}: ${transition}`);
    }

    return {
      image_path: imagePath,
      start,
      end,
      transition,
      show_pip: overlay?.show_pip === false ? false : true
    };
  }).sort((a, b) => a.start - b.start || a.end - b.end);

  if (options.duration !== undefined) {
    validateOverlayTiming(overlays, Number(options.duration));
  }

  if (options.imageDimensions !== undefined) {
    validateImageDimensions(overlays, options.imageDimensions, format, outputDimensions);
  }

  const presenterPip = normalizePresenterPip(input.presenter_pip, {
    outputDimensions,
    videoDimensions: options.videoDimensions
  });

  return {
    schemaVersion: input.schemaVersion || 1,
    video_path: videoPath,
    format,
    output: outputDimensions,
    overlays,
    presenter_pip: presenterPip,
    output_path: outputPath
  };
}

function buildOverlaySourceFilter(overlay, index, outputDimensions, fadeOptions) {
  const label = `ov${index}`;
  const source = `[${index + 1}:v]format=rgba,scale=${outputDimensions.width}:${outputDimensions.height}`;

  if (overlay.transition === 'cut') {
    return `${source}[${label}]`;
  }

  const filters = [source];
  const duration = overlay.end - overlay.start;
  const fadeSeconds = Math.min(
    DEFAULT_FADE_SECONDS,
    fadeOptions.fadeIn && fadeOptions.fadeOut ? duration / 2 : duration
  );

  if (fadeOptions.fadeIn) {
    filters.push(`fade=t=in:st=${formatSeconds(overlay.start)}:d=${formatSeconds(fadeSeconds)}:alpha=1`);
  }

  if (fadeOptions.fadeOut) {
    const fadeOutStart = Math.max(overlay.start, overlay.end - fadeSeconds);
    filters.push(`fade=t=out:st=${formatSeconds(fadeOutStart)}:d=${formatSeconds(fadeSeconds)}:alpha=1`);
  }

  return `${filters.join(',')}[${label}]`;
}

function shouldRenderPresenterPip(request) {
  return request.presenter_pip?.enabled === true
    && request.overlays.some((overlay) => overlay.show_pip !== false);
}

function pipPositionExpression(pip, outputDimensions) {
  const maxX = outputDimensions.width - pip.size - pip.margin;
  const maxY = outputDimensions.height - pip.size - pip.margin;

  if (pip.position === 'top-left') {
    return { x: pip.margin, y: pip.margin };
  }
  if (pip.position === 'bottom-left') {
    return { x: pip.margin, y: maxY };
  }
  if (pip.position === 'bottom-right') {
    return { x: maxX, y: maxY };
  }

  return { x: maxX, y: pip.margin };
}

function pipEnableExpression(overlays) {
  return overlays
    .filter((overlay) => overlay.show_pip !== false)
    .map((overlay) => `between(t,${formatSeconds(overlay.start)},${formatSeconds(overlay.end)})`)
    .join('+');
}

function buildPresenterPipFilters(request, inputLabel) {
  const pip = request.presenter_pip;
  const crop = pip.crop;
  const position = pipPositionExpression(pip, request.output);
  const enable = pipEnableExpression(request.overlays);
  const radiusExpr = '(W/2)*(W/2)';
  const distanceExpr = '(X-W/2)*(X-W/2)+(Y-H/2)*(Y-H/2)';
  const alphaExpr = `if(lte(${distanceExpr},${radiusExpr}),255,0)`;

  return [
    `[pipSource]crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=${pip.size}:${pip.size},setsar=1,format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${alphaExpr}'[pip]`,
    `[${inputLabel}][pip]overlay=${position.x}:${position.y}:enable='${enable}'[vout]`
  ];
}

export function buildApplyOverlaysFilter(request) {
  const { width, height } = request.output;
  const renderPip = shouldRenderPresenterPip(request);
  const filters = renderPip
    ? [
        '[0:v]split=2[baseSource][pipSource]',
        `[baseSource]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1[base0]`
      ]
    : [
        `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1[base0]`
      ];

  request.overlays.forEach((overlay, index) => {
    const inputLabel = index === 0 ? 'base0' : `base${index}`;
    const outputLabel = index === request.overlays.length - 1
      ? (renderPip ? 'cardsout' : 'vout')
      : `base${index + 1}`;
    const previous = request.overlays[index - 1];
    const next = request.overlays[index + 1];
    const fadeOptions = {
      fadeIn: !previous || overlay.start > previous.end + EPSILON_SECONDS,
      fadeOut: !next || next.start > overlay.end + EPSILON_SECONDS
    };

    filters.push(buildOverlaySourceFilter(overlay, index, request.output, fadeOptions));
    filters.push(
      `[${inputLabel}][ov${index}]overlay=0:0:enable='between(t,${formatSeconds(overlay.start)},${formatSeconds(overlay.end)})'[${outputLabel}]`
    );
  });

  if (renderPip) {
    filters.push(...buildPresenterPipFilters(request, 'cardsout'));
  }

  return filters.join(';');
}

function buildApplyOverlaysArgs(request, duration) {
  const args = [
    '-hide_banner',
    '-y',
    '-i',
    request.video_path
  ];

  for (const overlay of request.overlays) {
    args.push('-loop', '1', '-t', formatSeconds(duration), '-i', overlay.image_path);
  }

  args.push(
    '-filter_complex',
    buildApplyOverlaysFilter(request),
    '-map',
    '[vout]',
    '-map',
    '0:a?',
    '-t',
    formatSeconds(duration),
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-crf',
    '18',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    request.output_path
  );

  return args;
}

export async function applyOverlays(input) {
  const schema = await loadApplyOverlaysSchema();
  validateJsonSchema(input, schema, 'apply-overlays request');

  await assertReadableFile(path.resolve(input.video_path), 'video_path');
  await Promise.all(input.overlays.map((overlay, index) => (
    assertReadableFile(path.resolve(overlay.image_path), `overlays[${index}].image_path`)
  )));

  const videoInfo = await getVideoInfo(path.resolve(input.video_path));
  if (!videoInfo.video?.width || !videoInfo.video?.height) {
    throw new Error(`No video stream found: ${input.video_path}`);
  }
  if (!Number.isFinite(videoInfo.duration) || videoInfo.duration <= 0) {
    throw new Error(`Could not read video duration: ${input.video_path}`);
  }

  const imageDimensions = await Promise.all(
    input.overlays.map((overlay) => probeImageDimensions(path.resolve(overlay.image_path)))
  );
  const request = normalizeOverlayRequest(input, {
    duration: videoInfo.duration,
    videoDimensions: {
      width: videoInfo.video.width,
      height: videoInfo.video.height
    },
    imageDimensions
  });

  await fs.mkdir(path.dirname(request.output_path), { recursive: true });
  const ffmpeg = await runCommand('ffmpeg', buildApplyOverlaysArgs(request, videoInfo.duration), {
    capture: true
  });

  return {
    outputPath: request.output_path,
    duration: roundTime(videoInfo.duration),
    format: request.format,
    width: request.output.width,
    height: request.output.height,
    overlayCount: request.overlays.length,
    overlays: request.overlays.map((overlay) => ({
      imagePath: overlay.image_path,
      start: overlay.start,
      end: overlay.end,
      transition: overlay.transition,
      showPip: overlay.show_pip
    })),
    presenterPip: request.presenter_pip,
    ffmpegLog: ffmpeg.stderr
  };
}

export async function applyOverlaysFromArg(inputArg) {
  const request = await readApplyOverlaysRequest(inputArg);
  return applyOverlays(request);
}
