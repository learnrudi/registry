import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';

function placementStyle(position, width) {
  const maxWidth = Math.round(width * 0.58);

  if (position === 'bottom') {
    return {
      left: Math.round(width * 0.18),
      right: Math.round(width * 0.18),
      bottom: 108,
      textAlign: 'center',
      maxWidth: 'none'
    };
  }

  if (position === 'bottom-right') {
    return {
      right: 72,
      bottom: 92,
      textAlign: 'right',
      maxWidth
    };
  }

  return {
    left: 72,
    bottom: 92,
    textAlign: 'left',
    maxWidth
  };
}

function palette(style) {
  if (style === 'classic') {
    return {
      accent: '#0c78d6',
      panel: 'rgba(8, 12, 18, 0.86)',
      title: '#ffffff',
      subtitle: '#d6e9ff'
    };
  }

  if (style === 'minimal') {
    return {
      accent: '#f0b429',
      panel: 'rgba(8, 10, 12, 0.0)',
      title: '#ffffff',
      subtitle: '#d7d7d2'
    };
  }

  return {
    accent: '#41d6b6',
    panel: 'rgba(7, 9, 12, 0.74)',
    title: '#ffffff',
    subtitle: '#d7fff6'
  };
}

function frameWindow(item, fps) {
  const start = Math.round((item.at || 0) * fps);
  const duration = Math.max(1, Math.round((item.duration || 5) * fps));
  return {
    start,
    end: start + duration,
    duration
  };
}

export const LowerThirdLayer = ({items = [], fps}) => {
  const frame = useCurrentFrame();
  const {width} = useVideoConfig();

  return (
    <>
      {items.map((item, index) => {
        const window = frameWindow(item, fps);
        if (frame < window.start || frame >= window.end) {
          return null;
        }

        const introFrames = Math.min(12, Math.floor(window.duration / 3));
        const exitFrames = Math.min(10, Math.floor(window.duration / 3));
        const opacity = interpolate(
          frame,
          [window.start, window.start + introFrames, window.end - exitFrames, window.end],
          [0, 1, 1, 0],
          {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
        );
        const translateY = interpolate(
          frame,
          [window.start, window.start + introFrames],
          [18, 0],
          {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
        );
        const colors = palette(item.style || 'modern');
        const isMinimal = item.style === 'minimal';

        return (
          <div
            key={`${item.title}-${index}`}
            style={{
              position: 'absolute',
              ...placementStyle(item.position || 'bottom-left', width),
              opacity,
              transform: `translateY(${translateY}px)`,
              fontFamily: 'Inter, Arial, sans-serif'
            }}
          >
            <div
              style={{
                display: 'inline-grid',
                gridTemplateColumns: item.position === 'bottom-right' ? '1fr 6px' : '6px 1fr',
                gap: 14,
                alignItems: 'stretch',
                padding: isMinimal ? 0 : '16px 18px',
                borderRadius: isMinimal ? 0 : 6,
                background: colors.panel,
                boxShadow: isMinimal ? 'none' : '0 16px 38px rgba(0, 0, 0, 0.36)'
              }}
            >
              {item.position === 'bottom-right' ? null : (
                <div style={{background: colors.accent, borderRadius: 3}} />
              )}
              <div>
                <div
                  style={{
                    color: colors.title,
                    fontSize: isMinimal ? 38 : 42,
                    fontWeight: 760,
                    lineHeight: 1.02,
                    textShadow: '0 3px 16px rgba(0, 0, 0, 0.62)',
                    overflowWrap: 'break-word'
                  }}
                >
                  {item.title}
                </div>
                {item.subtitle ? (
                  <div
                    style={{
                      marginTop: 7,
                      color: colors.subtitle,
                      fontSize: isMinimal ? 24 : 26,
                      fontWeight: 520,
                      lineHeight: 1.12,
                      textShadow: '0 2px 12px rgba(0, 0, 0, 0.62)',
                      overflowWrap: 'break-word'
                    }}
                  >
                    {item.subtitle}
                  </div>
                ) : null}
              </div>
              {item.position === 'bottom-right' ? (
                <div style={{background: colors.accent, borderRadius: 3}} />
              ) : null}
            </div>
          </div>
        );
      })}
    </>
  );
};
