import {
  Audio,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import type { VideoFormat } from "../videoFormats.js";
import { resolveTheme, type VideoStyle } from "../theme.js";
import { labelStyle, panelStyle, StyleFrame } from "../stylePrimitives.js";

export interface StatCardData {
  eyebrow: string;
  headline: string;
  stat: string;
  caption: string;
  source?: string;
  accent_color?: string;
}

export interface StatCardShortProps {
  format: VideoFormat;
  style: VideoStyle;
  durationSeconds: number;
  data: StatCardData;
  audioSrc: string | null;
}

function fitFontSize(text: string, base: number, min: number, maxChars: number): number {
  const longestWord = text.split(/\s+/).reduce((max, word) => Math.max(max, word.length), 0);
  const lengthPressure = Math.max(0, text.length - maxChars) * 1.8;
  const wordPressure = Math.max(0, longestWord - 12) * 6;
  return Math.max(min, base - lengthPressure - wordPressure);
}

export const StatCardShort = ({ format, style, data, audioSrc }: StatCardShortProps) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const isLandscape = format === "landscape";
  const isSquare = format === "square";
  const isPortraitFeed = format === "portrait";
  const margin = isLandscape ? 96 : isSquare ? 70 : 74;
  const topRule = isLandscape ? 84 : isSquare ? 78 : 118;
  const contentTop = isLandscape ? 146 : isSquare ? 134 : isPortraitFeed ? 150 : 180;
  const statTop = isLandscape ? 420 : isSquare ? 448 : isPortraitFeed ? 520 : 640;
  const captionBottom = isLandscape ? 112 : isSquare ? 96 : isPortraitFeed ? 148 : 220;
  const maxHeadlineWidth = isLandscape ? 1040 : isSquare ? 850 : 900;
  const theme = resolveTheme(style, data.accent_color);
  const reveal = spring({
    frame: frame - 18,
    fps,
    config: { damping: 18, stiffness: 120, mass: 0.7 },
  });
  const fadeIn = interpolate(frame, [0, 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const captionOpacity = interpolate(frame, [82, 112], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const exitLift = interpolate(frame, [durationInFrames - 26, durationInFrames], [0, -36], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const headlineSize = fitFontSize(
    data.headline,
    isLandscape ? 68 : isSquare ? 58 : 76,
    isLandscape ? 42 : 40,
    isLandscape ? 70 : 52
  );
  const statSize = fitFontSize(data.stat, isLandscape ? 162 : isSquare ? 164 : 210, isLandscape ? 92 : 104, 8);
  const captionSize = fitFontSize(data.caption, isLandscape ? 34 : isSquare ? 34 : 42, 28, isLandscape ? 120 : 95);
  const renderStyleHeader = () => {
    if (style === "dashboard") {
      return (
        <div
          style={{
            position: "absolute",
            left: margin,
            right: margin,
            top: topRule,
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 14,
            fontFamily: theme.monoFamily,
            color: theme.accent,
            fontSize: isLandscape ? 20 : 24,
          }}
        >
          {["INPUT", "SIGNAL", "DELTA"].map((label, index) => (
            <div
              key={label}
              style={{
                border: `1px solid ${theme.border}`,
                backgroundColor: theme.panel,
                padding: "14px 16px",
              }}
            >
              {label}.0{index + 1}
            </div>
          ))}
        </div>
      );
    }

    if (style === "launch") {
      return (
        <div
          style={{
            position: "absolute",
            left: margin,
            right: margin,
            top: topRule,
            height: 28,
            backgroundColor: theme.secondary,
            transform: "skewX(-18deg) scaleX(0.98)",
            transformOrigin: "left center",
          }}
        />
      );
    }

    if (style === "field-guide") {
      return (
        <div
          style={{
            position: "absolute",
            left: margin,
            top: topRule,
            display: "flex",
            gap: 16,
          }}
        >
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              style={{
                width: 44,
                height: 44,
                border: `2px solid ${theme.border}`,
                backgroundColor: index === 0 ? theme.accent : "transparent",
              }}
            />
          ))}
        </div>
      );
    }

    if (style === "neon") {
      return (
        <div
          style={{
            position: "absolute",
            left: margin,
            right: margin,
            top: topRule,
            height: 8,
            backgroundColor: theme.accent,
            boxShadow: `0 0 26px ${theme.accent}`,
            opacity: 0.95,
          }}
        />
      );
    }

    return (
      <div
        style={{
          position: "absolute",
          left: margin,
          top: topRule,
          width: isLandscape ? 210 : 170,
          height: 4,
          backgroundColor: theme.accent,
          opacity: 0.95,
          transform: `scaleX(${fadeIn})`,
          transformOrigin: "left center",
        }}
      />
    );
  };

  const renderStatValue = () => {
    if (style === "editorial") {
      return (
        <div
          style={{
            color: theme.accent,
            borderTop: `3px solid ${theme.border}`,
            borderBottom: `3px solid ${theme.border}`,
            padding: "20px 0 28px",
            fontSize: statSize,
            lineHeight: 0.9,
            fontWeight: 760,
            letterSpacing: 0,
            overflowWrap: "break-word",
            maxWidth: "100%",
          }}
        >
          {data.stat}
        </div>
      );
    }

    if (style === "launch") {
      return (
        <div
          style={{
            display: "inline-block",
            color: theme.accentText,
            backgroundColor: theme.accent,
            padding: "22px 44px 32px",
            fontSize: statSize,
            lineHeight: 0.88,
            fontWeight: 920,
            letterSpacing: 0,
            overflowWrap: "break-word",
            maxWidth: "100%",
            transform: "skewX(-8deg)",
            boxShadow: theme.shadow,
          }}
        >
          <div style={{ transform: "skewX(8deg)" }}>{data.stat}</div>
        </div>
      );
    }

    if (style === "field-guide") {
      return (
        <div
          style={{
            ...panelStyle(style, theme),
            display: "inline-block",
            color: theme.foreground,
            borderLeft: `14px solid ${theme.accent}`,
            padding: "26px 38px 34px",
            fontSize: Math.round(statSize * 0.9),
            lineHeight: 0.94,
            fontWeight: 820,
            overflowWrap: "break-word",
            maxWidth: "100%",
          }}
        >
          {data.stat}
        </div>
      );
    }

    if (style === "neon") {
      return (
        <div
          style={{
            display: "inline-block",
            color: theme.accent,
            border: `3px solid ${theme.accent}`,
            padding: "22px 36px 30px",
            fontSize: statSize,
            lineHeight: 0.9,
            fontWeight: 920,
            letterSpacing: 0,
            overflowWrap: "break-word",
            maxWidth: "100%",
            boxShadow: `0 0 30px ${theme.border}`,
            textShadow: theme.textShadow,
          }}
        >
          {data.stat}
        </div>
      );
    }

    return (
      <div
        style={{
          ...panelStyle(style, theme),
          display: "inline-block",
          color: theme.foreground,
          borderLeft: `12px solid ${theme.accent}`,
          padding: "28px 38px 34px",
          fontSize: statSize,
          lineHeight: 0.92,
          fontWeight: 900,
          letterSpacing: 0,
          overflowWrap: "break-word",
          maxWidth: "100%",
        }}
      >
        {data.stat}
      </div>
    );
  };

  return (
    <StyleFrame style={style} theme={theme} width={width} height={height} frame={frame}>
      {audioSrc ? <Audio src={audioSrc} /> : null}
      {renderStyleHeader()}
      <div
        style={{
          position: "absolute",
          left: margin,
          right: margin,
          top: contentTop + exitLift,
          opacity: fadeIn,
        }}
      >
        <div
          style={{
            ...labelStyle(style, theme, isLandscape ? 28 : 32),
            marginBottom: 36,
          }}
        >
          {data.eyebrow}
        </div>
        <div
          style={{
            fontSize: headlineSize,
            lineHeight: 1.06,
            fontWeight: theme.weight,
            maxWidth: maxHeadlineWidth,
            overflowWrap: "break-word",
            textShadow: theme.textShadow,
          }}
        >
          {data.headline}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: margin,
          right: margin,
          top: statTop + exitLift,
          transform: `translateY(${interpolate(reveal, [0, 1], [90, 0])}px) scale(${interpolate(reveal, [0, 1], [0.82, 1])})`,
          transformOrigin: "left center",
          opacity: Math.min(1, reveal),
        }}
      >
        {renderStatValue()}
      </div>
      <div
        style={{
          position: "absolute",
          left: margin,
          right: margin,
          bottom: captionBottom,
          opacity: captionOpacity,
          transform: `translateY(${interpolate(captionOpacity, [0, 1], [36, 0])}px)`,
        }}
      >
        <div
          style={{
            fontSize: captionSize,
            lineHeight: 1.22,
            fontWeight: 560,
            color: theme.muted,
            maxWidth: isLandscape ? 1120 : 860,
            overflowWrap: "break-word",
          }}
        >
          {data.caption}
        </div>
        {data.source ? (
          <div
            style={{
              marginTop: 48,
              fontSize: 26,
              lineHeight: 1.15,
              color: theme.muted,
              overflowWrap: "break-word",
            }}
          >
            {data.source}
          </div>
        ) : null}
      </div>
      <div
        style={{
          position: "absolute",
          right: -180,
          bottom: -120,
          width: Math.round(width * 0.58),
          height: Math.round(height * 0.22),
          transform: "rotate(-24deg)",
          border: `3px solid ${theme.border}`,
          opacity: style === "editorial" || style === "field-guide" ? 0.45 : 1,
        }}
      />
    </StyleFrame>
  );
};
