import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {getPillTextStyle, getTextOverlayPlacement} from './tiktokOverlayStyle.js';

export const TextOverlayLayer = ({overlays = [], fps}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();

  return (
    <>
      {overlays.map((overlay, index) => {
        const start = Math.round(overlay.at * fps);
        const duration = Math.max(1, Math.round(overlay.duration * fps));
        const end = start + duration;
        const isActive = frame >= start && frame < end;

        if (!isActive) {
          return null;
        }

        const fadeFrames = Math.min(8, Math.floor(duration / 3));
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
            key={`${overlay.text}-${index}`}
            style={{
              ...getTextOverlayPlacement(overlay.position || 'bottom', width, height),
              opacity,
              zIndex: 50
            }}
          >
            <div style={getPillTextStyle(overlay.size || 'default', width, height)}>
              {overlay.text}
            </div>
          </div>
        );
      })}
    </>
  );
};
