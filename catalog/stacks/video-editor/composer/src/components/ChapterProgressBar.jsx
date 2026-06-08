import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {getTikTokSafeArea, scaledPx} from './tiktokOverlayStyle.js';

// Thin progress bar near the top of the frame. Two layers:
//   1. A pale full-width track showing all chapter boundaries (tick marks)
//   2. A bright fill that animates 0 to 100% within the CURRENT chapter,
//      then resets when the next chapter starts.
// Sits below the TikTok top search UI and fades out when an insight card is
// active so the card owns the visual beat.
export const ChapterProgressBar = ({chapters = [], insights = [], fps, totalDurationInFrames}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();

  if (chapters.length === 0) return null;

  const chapterFrames = chapters.map((ch, i) => {
    const start = Math.round(ch.at * fps);
    const end = i + 1 < chapters.length
      ? Math.round(chapters[i + 1].at * fps)
      : totalDurationInFrames;
    return { start, end, title: ch.title };
  });

  const current = chapterFrames.filter((c) => frame >= c.start).slice(-1)[0];
  if (!current) return null;

  const fillPct = interpolate(
    frame,
    [current.start, current.end],
    [0, 100],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
  );

  const safeArea = getTikTokSafeArea(width, height);
  const trackHeight = scaledPx(5, width, height);
  const trackTop = Math.max(scaledPx(112, width, height), safeArea.top - scaledPx(18, width, height));
  const strip = { top: trackTop - scaledPx(8, width, height), height: scaledPx(22, width, height) };
  const margin = safeArea.left;
  const trackWidth = safeArea.contentWidth;

  // Fade out when any insight card is active
  const insightActive = insights.find((ins) => {
    const s = Math.round(ins.at * fps);
    const e = s + Math.round(ins.duration * fps);
    return frame >= s && frame < e;
  });
  const fadeEdge = 8;
  let opacity = 1;
  if (insightActive) {
    const s = Math.round(insightActive.at * fps);
    const e = s + Math.round(insightActive.duration * fps);
    opacity = interpolate(frame, [s, s + fadeEdge, e - fadeEdge, e], [1, 0, 0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  }

  return (
    <div style={{position: 'absolute', inset: 0, opacity, zIndex: 20}}>
      {/* Frosted backing strip makes the bar readable on light or dark frames. */}
      <div style={{
        position: 'absolute',
        top: strip.top,
        left: 0,
        right: 0,
        height: strip.height,
        background: 'rgba(0, 0, 0, 0.20)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)'
      }} />

      {/* Faint full track */}
      <div style={{
        position: 'absolute',
        top: trackTop,
        left: margin,
        width: trackWidth,
        height: trackHeight,
        background: 'rgba(255, 255, 255, 0.34)',
        borderRadius: trackHeight / 2,
        overflow: 'hidden'
      }} />

      {/* Chapter tick marks */}
      {chapterFrames.slice(1).map((c, i) => {
        const pct = c.start / totalDurationInFrames;
        return (
          <div key={i} style={{
            position: 'absolute',
            top: trackTop - 2,
            left: margin + trackWidth * pct - 1,
            width: 2,
            height: trackHeight + 4,
            background: 'rgba(255, 255, 255, 0.72)'
          }} />
        );
      })}

      {/* Active chapter fill */}
      <div style={{
        position: 'absolute',
        top: trackTop,
        left: margin + trackWidth * (current.start / totalDurationInFrames),
        width: trackWidth * ((current.end - current.start) / totalDurationInFrames) * (fillPct / 100),
        height: trackHeight,
        background: '#ffffff',
        borderRadius: trackHeight / 2,
        boxShadow: '0 0 10px rgba(255, 255, 255, 0.60)'
      }} />
    </div>
  );
};
