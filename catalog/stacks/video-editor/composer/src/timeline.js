export function secondsToFrame(seconds, fps) {
  return Math.round(seconds * fps);
}

export function getFps(composition) {
  return composition.source?.fps || 30;
}

export function getTimelineClips(composition) {
  const fps = getFps(composition);
  let cursor = 0;

  return (composition.timeline?.keepRanges || []).map((range) => {
    const speed = Number.isFinite(range.speed) && range.speed > 0 ? range.speed : 1;
    const sourceStartFrame = secondsToFrame(range.start, fps);
    const sourceEndFrame = Math.max(sourceStartFrame + 1, secondsToFrame(range.end, fps));
    const sourceFrames = sourceEndFrame - sourceStartFrame;
    const durationInFrames = Math.max(1, Math.round(sourceFrames / speed));
    const clip = {
      sourceStartFrame,
      sourceEndFrame,
      sourceDurationInFrames: sourceFrames,
      speed,
      timelineStartFrame: cursor,
      durationInFrames
    };
    cursor += durationInFrames;
    return clip;
  });
}

export function getTimelineDurationInFrames(composition) {
  const clips = getTimelineClips(composition);
  return Math.max(
    1,
    clips.reduce((sum, clip) => sum + clip.durationInFrames, 0)
  );
}

export function getVideoScale(composition, frame) {
  const fps = getFps(composition);
  const activePunch = (composition.timeline?.punchIns || []).find((punch) => {
    const start = secondsToFrame(punch.at, fps);
    const end = start + secondsToFrame(punch.duration, fps);
    return frame >= start && frame < end;
  });

  if (!activePunch) {
    return 1;
  }

  const start = secondsToFrame(activePunch.at, fps);
  const duration = Math.max(1, secondsToFrame(activePunch.duration, fps));
  const fadeFrames = Math.min(12, Math.floor(duration / 3));
  const localFrame = frame - start;
  const targetScale = activePunch.scale || 1;

  if (fadeFrames <= 0 || targetScale <= 1) {
    return targetScale;
  }

  if (localFrame < fadeFrames) {
    return 1 + ((targetScale - 1) * (localFrame / fadeFrames));
  }

  if (localFrame > duration - fadeFrames) {
    return 1 + ((targetScale - 1) * ((duration - localFrame) / fadeFrames));
  }

  return targetScale;
}

export function getAudioCrossfadeFrames(composition) {
  const fps = getFps(composition);
  const seconds = composition.timeline?.audioCrossfadeSeconds || 0;
  return Math.max(0, secondsToFrame(seconds, fps));
}

export function getCompositionMetadata(props) {
  const fps = props.composition?.source?.fps || props.project?.settings?.fps || 30;
  const video = props.probeSummary?.video || {};
  const width = video.width || 1620;
  const height = video.height || 1080;
  const durationInFrames = getTimelineDurationInFrames({
    ...props.composition,
    source: {
      ...(props.composition?.source || {}),
      fps
    }
  });

  return {
    durationInFrames,
    fps,
    width,
    height,
    props
  };
}
