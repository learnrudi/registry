import {
  Audio,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { resolveTheme, type VideoStyle } from "../theme.js";
import type { VideoFormat } from "../videoFormats.js";
import { labelStyle, panelStyle, ProgressIndicator, StyleFrame } from "../stylePrimitives.js";

export interface QuoteReelData {
  quote: string;
  speaker: string;
  context?: string;
  kicker?: string;
  accent_color?: string;
}

export interface QuoteReelProps {
  format: VideoFormat;
  style: VideoStyle;
  durationSeconds: number;
  data: QuoteReelData;
  audioSrc: string | null;
}

function fitFontSize(text: string, base: number, min: number, maxChars: number): number {
  const longestWord = text.split(/\s+/).reduce((max, word) => Math.max(max, word.length), 0);
  return Math.max(min, base - Math.max(0, text.length - maxChars) * 1.6 - Math.max(0, longestWord - 13) * 4);
}

export const QuoteReel = ({ format, style, data, audioSrc }: QuoteReelProps) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const theme = resolveTheme(style, data.accent_color);
  const isLandscape = format === "landscape";
  const isSquare = format === "square";
  const margin = isLandscape ? 112 : isSquare ? 82 : 86;
  const quoteSize = fitFontSize(data.quote, isLandscape ? 78 : isSquare ? 64 : 76, isLandscape ? 42 : 38, isLandscape ? 110 : 74);
  const reveal = spring({
    frame: frame - 10,
    fps,
    config: { damping: 18, stiffness: 120, mass: 0.75 },
  });
  const fadeOut = interpolate(frame, [durationInFrames - 24, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const quoteProgress = interpolate(frame, [18, durationInFrames - 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const quotePanel =
    style === "dashboard" || style === "field-guide" || style === "neon"
      ? {
          ...panelStyle(style, theme),
          padding: isLandscape ? "54px 64px" : "58px 50px",
        }
      : style === "launch"
        ? {
            backgroundColor: theme.accent,
            color: theme.accentText,
            padding: isLandscape ? "54px 64px" : "58px 48px",
            transform: `skewX(-6deg) translateY(${interpolate(reveal, [0, 1], [54, 0])}px)`,
            boxShadow: theme.shadow,
          }
        : {};
  const quoteInnerTransform = style === "launch" ? "skewX(6deg)" : undefined;

  return (
    <StyleFrame style={style} theme={theme} width={width} height={height} frame={frame}>
      {audioSrc ? <Audio src={audioSrc} /> : null}
      <ProgressIndicator
        style={style}
        theme={theme}
        left={margin}
        right={margin}
        top={isLandscape ? 70 : 92}
        progress={quoteProgress}
      />
      {style === "editorial" ? (
        <div
          style={{
            position: "absolute",
            left: margin - 16,
            top: isLandscape ? 116 : isSquare ? 112 : 180,
            color: "rgba(179,66,45,0.18)",
            fontSize: isLandscape ? 280 : 300,
            lineHeight: 0.8,
            fontWeight: 760,
          }}
        >
          "
        </div>
      ) : null}
      <div
        style={{
          position: "absolute",
          left: margin,
          right: margin,
          top: isLandscape ? 170 : isSquare ? 160 : 250,
          opacity: fadeOut,
          transform: style === "launch" ? undefined : `translateY(${interpolate(reveal, [0, 1], [54, 0])}px)`,
          ...quotePanel,
        }}
      >
        <div style={{ transform: quoteInnerTransform }}>
        <div
          style={{
            ...labelStyle(style, theme, isLandscape ? 28 : 32),
            color: style === "launch" ? theme.accentText : labelStyle(style, theme, isLandscape ? 28 : 32).color,
            marginBottom: isLandscape ? 36 : 50,
          }}
        >
          {data.kicker ?? theme.label}
        </div>
        <div
          style={{
            fontSize: quoteSize,
            lineHeight: 1.08,
            fontWeight: theme.weight,
            maxWidth: isLandscape ? 1260 : width - margin * 2,
            overflowWrap: "break-word",
            textShadow: theme.textShadow,
          }}
        >
          {style === "editorial" ? data.quote : `"${data.quote}"`}
        </div>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: margin,
          right: margin,
          bottom: isLandscape ? 96 : 170,
          opacity: interpolate(frame, [45, 72, durationInFrames - 18, durationInFrames], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div
          style={{
            width: 74,
            height: 10,
            backgroundColor: style === "launch" ? theme.secondary : theme.accent,
            marginBottom: 30,
            boxShadow: style === "neon" ? `0 0 18px ${theme.accent}` : undefined,
          }}
        />
        <div
          style={{
            fontSize: isLandscape ? 36 : 40,
            lineHeight: 1.12,
            fontWeight: theme.weight - 80,
            fontFamily: style === "dashboard" || style === "neon" ? theme.monoFamily : theme.fontFamily,
          }}
        >
          {data.speaker}
        </div>
        {data.context ? (
          <div
            style={{
              marginTop: 12,
              fontSize: isLandscape ? 26 : 30,
              color: theme.muted,
              overflowWrap: "break-word",
            }}
          >
            {data.context}
          </div>
        ) : null}
      </div>
      <div
        style={{
          position: "absolute",
          right: -Math.round(width * 0.12),
          bottom: -Math.round(height * 0.1),
          width: Math.round(width * 0.42),
          height: Math.round(height * 0.28),
          border: `3px solid ${theme.panel}`,
          transform: "rotate(-18deg)",
          opacity: style === "editorial" || style === "field-guide" ? 0.45 : 1,
        }}
      />
    </StyleFrame>
  );
};
