import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {getPillTextStyle, getTextOverlayPlacement} from './tiktokOverlayStyle.js';

// Chapter label at the top of the frame. Hides while an insight card is active
// so the card owns the visual beat.
//
// Skips render when the current chapter has an empty title; that's how the
// overlay-plan signals "no on-screen label for this section."

export const ChapterLabel = ({chapters = [], insights = [], fps, totalDurationInFrames}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();

  if (chapters.length === 0) return null;

  const chapterFrames = chapters.map((ch, i) => {
    const start = Math.round(ch.at * fps);
    const end = i + 1 < chapters.length
      ? Math.round(chapters[i + 1].at * fps)
      : totalDurationInFrames;
    return { start, end, title: ch.title, index: i };
  });

  const current = chapterFrames.filter((c) => frame >= c.start).slice(-1)[0];
  if (!current) return null;
  // Empty title = deliberate "no overlay" choice from the overlay-plan.
  if (!current.title || String(current.title).trim() === '') return null;

  // Fade in at chapter start
  const inOpacity = interpolate(frame, [current.start, current.start + 10], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp'
  });

  // Fade out when any insight card is active
  const insightActive = insights.find((ins) => {
    const s = Math.round(ins.at * fps);
    const e = s + Math.round(ins.duration * fps);
    return frame >= s && frame < e;
  });
  const fadeEdge = 8;
  let insightOpacity = 1;
  if (insightActive) {
    const s = Math.round(insightActive.at * fps);
    const e = s + Math.round(insightActive.duration * fps);
    insightOpacity = interpolate(
      frame, [s, s + fadeEdge, e - fadeEdge, e], [1, 0, 0, 1],
      {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
    );
  }
  const opacity = inOpacity * insightOpacity;

  return (
    <div style={{
      ...getTextOverlayPlacement('top-left', width, height),
      opacity,
      zIndex: 35
    }}>
      <div style={{
        ...getPillTextStyle('small', width, height),
        maxWidth: '78%'
      }}>
        <div style={{
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {current.title}
        </div>
      </div>
    </div>
  );
};
