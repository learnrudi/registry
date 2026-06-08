import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {getCaptionTextStyle, getTextOverlayPlacement} from './tiktokOverlayStyle.js';

// Reads cues from composition.timeline.captions.cues (each cue has at, duration, text).

export const CaptionLayer = ({captions = {}, fps}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();

  if (!captions.enabled || !Array.isArray(captions.cues)) {
    return null;
  }

  return (
    <>
      {captions.cues.map((cue, index) => {
        const start = Math.round(cue.at * fps);
        const duration = Math.max(1, Math.round(cue.duration * fps));
        const end = start + duration;
        const isActive = frame >= start && frame < end;
        if (!isActive) return null;

        const fadeFrames = Math.min(6, Math.floor(duration / 3));
        const opacity = fadeFrames > 0
          ? interpolate(
            frame,
            [start, start + fadeFrames, end - fadeFrames, end],
            [0, 1, 1, 0],
            {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
          )
          : 1;

        return (
          <div
            key={`${cue.at}-${cue.text}-${index}`}
            style={{
              ...getTextOverlayPlacement('bottom', width, height),
              opacity,
              zIndex: 40
            }}
          >
            <div
              style={getCaptionTextStyle(width, height)}
            >
              {cue.text}
            </div>
          </div>
        );
      })}
    </>
  );
};
