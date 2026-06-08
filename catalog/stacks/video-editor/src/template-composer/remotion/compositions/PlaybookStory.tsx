import {
  Audio,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import type { VideoFormat } from "../videoFormats.js";
import { resolveTheme, type VideoStyle } from "../theme.js";
import { labelStyle, panelStyle, ProgressIndicator, StyleFrame } from "../stylePrimitives.js";

export interface PlaybookSection {
  eyebrow: string;
  headline: string;
  body: string;
  stat?: string;
}

export interface PlaybookStoryData {
  title: string;
  subtitle?: string;
  sections: PlaybookSection[];
  cta?: string;
  accent_color?: string;
}

export interface PlaybookStoryProps {
  format: VideoFormat;
  style: VideoStyle;
  durationSeconds: number;
  data: PlaybookStoryData;
  audioSrc: string | null;
}

function fitFontSize(text: string, base: number, min: number, maxChars: number): number {
  const longestWord = text.split(/\s+/).reduce((max, word) => Math.max(max, word.length), 0);
  const lengthPressure = Math.max(0, text.length - maxChars) * 1.5;
  const wordPressure = Math.max(0, longestWord - 13) * 5;
  return Math.max(min, base - lengthPressure - wordPressure);
}

function sectionAt(sections: PlaybookSection[], index: number): PlaybookSection {
  return sections[Math.max(0, Math.min(index, sections.length - 1))];
}

export const PlaybookStory = ({ format, style, data, audioSrc }: PlaybookStoryProps) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const sections = data.sections.length > 0 ? data.sections : [];
  const sceneCount = Math.max(3, sections.length + 2);
  const sceneFrames = durationInFrames / sceneCount;
  const sceneIndex = Math.min(sceneCount - 1, Math.floor(frame / sceneFrames));
  const localFrame = frame - sceneIndex * sceneFrames;
  const localProgress = Math.max(0, Math.min(1, localFrame / sceneFrames));
  const theme = resolveTheme(style, data.accent_color);
  const isLandscape = format === "landscape";
  const isSquare = format === "square";
  const margin = isLandscape ? 108 : isSquare ? 78 : 82;
  const contentWidth = width - margin * 2;
  const reveal = spring({
    frame: localFrame,
    fps,
    config: { damping: 20, stiffness: 110, mass: 0.8 },
  });
  const fade = interpolate(localProgress, [0, 0.12, 0.88, 1], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const lift = interpolate(reveal, [0, 1], [42, 0]);

  const titleSize = fitFontSize(data.title, isLandscape ? 74 : isSquare ? 64 : 78, 42, isLandscape ? 82 : 58);
  const sectionTitleSize = isLandscape ? 58 : isSquare ? 50 : 62;
  const bodySize = isLandscape ? 34 : isSquare ? 32 : 40;

  const renderIntro = () => (
    <div
      style={{
        position: "absolute",
        left: margin,
        right: margin,
        top: isLandscape ? 170 : isSquare ? 160 : 280,
        padding: style === "dashboard" || style === "field-guide" || style === "neon" ? "48px 54px" : undefined,
        ...(style === "dashboard" || style === "field-guide" || style === "neon" ? panelStyle(style, theme) : {}),
        opacity: fade,
        transform: `translateY(${lift}px)`,
      }}
    >
      <div
        style={{
          ...labelStyle(style, theme, isLandscape ? 30 : 32),
          marginBottom: 32,
        }}
      >
        Playbook
      </div>
      <div
        style={{
          fontSize: titleSize,
          lineHeight: 1.04,
          fontWeight: theme.weight,
          maxWidth: isLandscape ? 1120 : contentWidth,
          overflowWrap: "break-word",
          textShadow: theme.textShadow,
        }}
      >
        {data.title}
      </div>
      {data.subtitle ? (
        <div
          style={{
            marginTop: 38,
            fontSize: isLandscape ? 34 : 38,
            lineHeight: 1.24,
            fontWeight: 520,
            color: theme.muted,
            maxWidth: isLandscape ? 980 : contentWidth,
            overflowWrap: "break-word",
          }}
        >
          {data.subtitle}
        </div>
      ) : null}
    </div>
  );

  const renderSection = (section: PlaybookSection, index: number) => (
    <div
      style={{
        position: "absolute",
        left: margin,
        right: margin,
        top: isLandscape ? 116 : isSquare ? 112 : 190,
        padding:
          style === "dashboard" || style === "field-guide" || style === "neon"
            ? isLandscape
              ? "44px 50px"
              : "46px 44px"
            : undefined,
        ...(style === "dashboard" || style === "field-guide" || style === "neon" ? panelStyle(style, theme) : {}),
        opacity: fade,
        transform: `${style === "launch" ? "skewX(-2deg) " : ""}translateY(${lift}px)`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 22,
          marginBottom: isLandscape ? 44 : 56,
        }}
      >
        <div
          style={{
            width: 68,
            height: 68,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.accent,
            color: theme.accentText,
            border: style === "editorial" || style === "field-guide" ? `2px solid ${theme.accent}` : undefined,
            boxShadow: style === "neon" ? `0 0 20px ${theme.accent}` : undefined,
            fontSize: 30,
            fontWeight: 900,
          }}
        >
          {section.stat ?? String(index + 1)}
        </div>
        <div
          style={{
            ...labelStyle(style, theme, 30),
            overflowWrap: "break-word",
          }}
        >
          {section.eyebrow}
        </div>
      </div>
      <div
        style={{
          fontSize: fitFontSize(section.headline, sectionTitleSize, isLandscape ? 38 : 36, isLandscape ? 86 : 64),
          lineHeight: 1.07,
          fontWeight: theme.weight,
          maxWidth: isLandscape ? 1120 : contentWidth,
          overflowWrap: "break-word",
          textShadow: theme.textShadow,
        }}
      >
        {section.headline}
      </div>
      <div
        style={{
          marginTop: isLandscape ? 38 : 48,
          fontSize: fitFontSize(section.body, bodySize, 28, isLandscape ? 160 : 120),
          lineHeight: 1.25,
          fontWeight: 500,
          color: theme.muted,
          maxWidth: isLandscape ? 1080 : contentWidth,
          overflowWrap: "break-word",
        }}
      >
        {section.body}
      </div>
    </div>
  );

  const renderOutro = () => (
    <div
      style={{
        position: "absolute",
        left: margin,
        right: margin,
        top: isLandscape ? 210 : isSquare ? 250 : 430,
        padding: style === "field-guide" || style === "neon" ? "46px 52px" : undefined,
        ...(style === "field-guide" || style === "neon" ? panelStyle(style, theme) : {}),
        opacity: fade,
        transform: `translateY(${lift}px)`,
      }}
    >
      <div
        style={{
          ...labelStyle(style, theme, 34),
          marginBottom: 34,
        }}
      >
        Next
      </div>
      <div
        style={{
          fontSize: fitFontSize(data.cta ?? data.title, isLandscape ? 72 : isSquare ? 62 : 76, 40, isLandscape ? 90 : 58),
          lineHeight: 1.06,
          fontWeight: theme.weight,
          maxWidth: isLandscape ? 1080 : contentWidth,
          overflowWrap: "break-word",
          textShadow: theme.textShadow,
        }}
      >
        {data.cta ?? data.title}
      </div>
    </div>
  );

  const sectionScene = sceneIndex - 1;

  return (
    <StyleFrame style={style} theme={theme} width={width} height={height} frame={frame}>
      {audioSrc ? <Audio src={audioSrc} /> : null}
      <ProgressIndicator
        style={style}
        theme={theme}
        left={margin}
        right={margin}
        top={isLandscape ? 58 : 76}
        progress={(sceneIndex + localProgress) / sceneCount}
        segments={sceneCount}
        activeSegment={sceneIndex}
      />
      {sceneIndex === 0
        ? renderIntro()
        : sceneIndex >= sceneCount - 1
          ? renderOutro()
          : renderSection(sectionAt(sections, sectionScene), sectionScene)}
      <div
        style={{
          position: "absolute",
          right: -Math.round(width * 0.1),
          bottom: -Math.round(height * 0.08),
          width: Math.round(width * 0.38),
          height: Math.round(height * 0.3),
          border: `3px solid ${theme.panel}`,
          transform: "rotate(-18deg)",
          opacity: style === "dashboard" || style === "neon" ? 1 : 0.45,
        }}
      />
    </StyleFrame>
  );
};
