import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {
  getPillTextStyle,
  getTextOverlayPlacement,
  scaledPx,
  TIKTOK_FONT_STACK
} from './tiktokOverlayStyle.js';

// Renders a teaching "insight card" overlay during specific moments in the
// timeline. The visual treatment intentionally matches TikTok-native white
// labels instead of the older full-screen card style.
//
// Each insight entry: { at: seconds, duration: seconds, title: string, body?: string, tag?: string }
//
// Cards stack visually only one-at-a-time; if multiple overlap, the latest wins.

export const InsightCardLayer = ({insights = [], fps}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();

  if (insights.length === 0) return null;

  const active = insights
    .filter((ins) => {
      const startFrame = Math.round(ins.at * fps);
      const endFrame = startFrame + Math.max(1, Math.round(ins.duration * fps));
      return frame >= startFrame && frame < endFrame;
    })
    .slice(-1)[0];

  if (!active) return null;

  const startFrame = Math.round(active.at * fps);
  const durationFrames = Math.max(1, Math.round(active.duration * fps));
  const endFrame = startFrame + durationFrames;
  const fadeFrames = Math.min(10, Math.floor(durationFrames / 3));

  const opacity = fadeFrames > 0
    ? interpolate(
      frame,
      [startFrame, startFrame + fadeFrames, endFrame - fadeFrames, endFrame],
      [0, 1, 1, 0],
      {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
    )
    : 1;
  const translateY = fadeFrames > 0
    ? interpolate(
      frame,
      [startFrame, startFrame + fadeFrames],
      [scaledPx(10, width, height, 0), 0],
      {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
    )
    : 0;

  const title = String(active.title || '');
  const hasBody = active.body && String(active.body).trim() !== '';
  const titleSize = title.length <= 8
    ? scaledPx(64, width, height, 26)
    : scaledPx(46, width, height, 22);

  return (
    <div
      style={{
        ...getTextOverlayPlacement('top', width, height),
        top: scaledPx(230, width, height),
        opacity,
        transform: `translateY(${translateY}px)`,
        zIndex: 30
      }}
    >
      <div
        style={{
          ...getPillTextStyle('default', width, height),
          padding: `${scaledPx(14, width, height)}px ${scaledPx(22, width, height)}px`,
          textAlign: 'center'
        }}
      >
        {active.tag ? (
          <div
            style={{
              color: '#3a3a3a',
              fontFamily: TIKTOK_FONT_STACK,
              fontSize: scaledPx(22, width, height, 12),
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: 0,
              marginBottom: scaledPx(6, width, height, 0),
              textTransform: 'uppercase'
            }}
          >
            {active.tag}
          </div>
        ) : null}
        <div style={{
          color: '#0b0b0b',
          fontFamily: TIKTOK_FONT_STACK,
          fontSize: titleSize,
          fontWeight: 800,
          lineHeight: 1.05,
          letterSpacing: 0,
          overflowWrap: 'break-word'
        }}>
          {title}
        </div>
        {hasBody ? (
          <div style={{
            color: '#222222',
            fontFamily: TIKTOK_FONT_STACK,
            fontSize: scaledPx(28, width, height, 15),
            fontStyle: 'normal',
            fontWeight: 650,
            lineHeight: 1.16,
            letterSpacing: 0,
            marginTop: scaledPx(8, width, height, 0),
            overflowWrap: 'break-word'
          }}>
            {active.body}
          </div>
        ) : null}
      </div>
    </div>
  );
};
