import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, interpolate } from "remotion";

import type { VideoStyle, VideoTheme } from "./theme.js";

export interface StyleFrameProps {
  style: VideoStyle;
  theme: VideoTheme;
  width: number;
  height: number;
  frame: number;
  children: ReactNode;
}

export interface ProgressIndicatorProps {
  style: VideoStyle;
  theme: VideoTheme;
  progress: number;
  left: number;
  right: number;
  top?: number;
  bottom?: number;
  segments?: number;
  activeSegment?: number;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function animatedOffset(frame: number, amount: number): number {
  return interpolate(frame, [0, 180], [0, amount], {
    extrapolateLeft: "clamp",
    extrapolateRight: "extend",
  });
}

function frameDecor(style: VideoStyle, theme: VideoTheme, width: number, height: number, frame: number) {
  const shift = animatedOffset(frame, 42);

  if (style === "editorial") {
    return (
      <>
        <AbsoluteFill style={{ background: theme.wash }} />
        <div
          style={{
            position: "absolute",
            left: Math.round(width * 0.055),
            top: Math.round(height * 0.06),
            bottom: Math.round(height * 0.06),
            width: 4,
            backgroundColor: theme.accent,
          }}
        />
        <div
          style={{
            position: "absolute",
            right: Math.round(width * 0.075),
            top: Math.round(height * 0.09),
            width: Math.round(width * 0.18),
            height: 2,
            backgroundColor: theme.border,
          }}
        />
        <div
          style={{
            position: "absolute",
            right: Math.round(width * 0.075),
            bottom: Math.round(height * 0.09),
            width: Math.round(width * 0.28),
            height: 2,
            backgroundColor: theme.border,
          }}
        />
      </>
    );
  }

  if (style === "dashboard") {
    return (
      <>
        <AbsoluteFill style={{ background: theme.wash, opacity: 0.92 }} />
        <div
          style={{
            position: "absolute",
            inset: 38,
            border: `1px solid ${theme.border}`,
          }}
        />
        <div
          style={{
            position: "absolute",
            right: Math.round(width * 0.06),
            top: Math.round(height * 0.09),
            width: Math.round(width * 0.18),
            height: Math.round(height * 0.14),
            border: `1px solid ${theme.border}`,
            backgroundColor: "rgba(7,17,15,0.58)",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: Math.round(width * 0.075),
            top: Math.round(height * 0.115),
            color: theme.accent,
            fontFamily: theme.monoFamily,
            fontSize: Math.max(18, Math.round(width * 0.015)),
          }}
        >
          LIVE.INPUT
        </div>
      </>
    );
  }

  if (style === "launch") {
    return (
      <>
        <AbsoluteFill style={{ background: theme.wash }} />
        <div
          style={{
            position: "absolute",
            left: -Math.round(width * 0.2) + shift,
            top: Math.round(height * 0.12),
            width: Math.round(width * 0.86),
            height: Math.round(height * 0.16),
            backgroundColor: theme.accent,
            transform: "rotate(-10deg)",
            opacity: 0.78,
          }}
        />
        <div
          style={{
            position: "absolute",
            right: -Math.round(width * 0.18),
            bottom: Math.round(height * 0.14),
            width: Math.round(width * 0.72),
            height: Math.round(height * 0.2),
            backgroundColor: theme.secondary,
            transform: "rotate(-10deg)",
            opacity: 0.78,
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "repeating-linear-gradient(115deg, rgba(255,255,255,0.1) 0 3px, transparent 3px 28px)",
            opacity: 0.38,
          }}
        />
      </>
    );
  }

  if (style === "field-guide") {
    return (
      <>
        <AbsoluteFill style={{ background: theme.wash }} />
        <div
          style={{
            position: "absolute",
            left: Math.round(width * 0.06),
            top: 0,
            bottom: 0,
            width: 2,
            backgroundColor: "rgba(183,93,49,0.32)",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: Math.round(width * 0.08),
            top: Math.round(height * 0.08),
            width: Math.round(width * 0.15),
            height: 48,
            backgroundColor: "rgba(183,93,49,0.22)",
            border: `1px solid ${theme.border}`,
          }}
        />
        <div
          style={{
            position: "absolute",
            right: Math.round(width * 0.09),
            top: Math.round(height * 0.095),
            fontFamily: theme.monoFamily,
            fontSize: Math.max(18, Math.round(width * 0.014)),
            color: theme.muted,
          }}
        >
          FIELD NOTE
        </div>
      </>
    );
  }

  if (style === "studio") {
    return (
      <>
        <AbsoluteFill style={{ background: theme.wash }} />
        <div
          style={{
            position: "absolute",
            left: Math.round(width * 0.09),
            right: Math.round(width * 0.09),
            top: Math.round(height * 0.1),
            height: Math.round(height * 0.42),
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.88), rgba(255,255,255,0.3))",
            borderRadius: Math.round(width * 0.035),
            filter: "blur(0.2px)",
            opacity: 0.7,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: Math.round(width * 0.14),
            right: Math.round(width * 0.14),
            bottom: Math.round(height * 0.08),
            height: 1,
            backgroundColor: theme.border,
          }}
        />
      </>
    );
  }

  return (
    <>
      <AbsoluteFill style={{ background: theme.wash, opacity: 0.96 }} />
      <div
        style={{
          position: "absolute",
          inset: 34,
          border: `1px solid ${theme.border}`,
          boxShadow: `0 0 28px ${theme.border}`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: -Math.round(width * 0.12) + shift,
          top: Math.round(height * 0.28),
          width: Math.round(width * 1.22),
          height: 2,
          backgroundColor: theme.secondary,
          boxShadow: `0 0 22px ${theme.secondary}`,
          transform: "rotate(-7deg)",
          opacity: 0.72,
        }}
      />
      <div
        style={{
          position: "absolute",
          right: Math.round(width * 0.08),
          bottom: Math.round(height * 0.09),
          width: Math.round(width * 0.26),
          height: Math.round(height * 0.12),
          border: `1px solid ${theme.secondary}`,
          transform: "skewX(-12deg)",
          opacity: 0.68,
        }}
      />
    </>
  );
}

export function StyleFrame({ style, theme, width, height, frame, children }: StyleFrameProps) {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.background,
        color: theme.foreground,
        fontFamily: theme.fontFamily,
        overflow: "hidden",
      }}
    >
      {frameDecor(style, theme, width, height, frame)}
      {children}
    </AbsoluteFill>
  );
}

export function labelStyle(style: VideoStyle, theme: VideoTheme, size: number): CSSProperties {
  const common: CSSProperties = {
    color: theme.accent,
    fontSize: size,
    fontWeight: Math.max(560, theme.weight - 100),
    letterSpacing: 0,
    overflowWrap: "break-word",
  };

  if (style === "editorial") {
    return { ...common, color: theme.secondary, fontStyle: "italic" };
  }
  if (style === "dashboard" || style === "neon") {
    return { ...common, fontFamily: theme.monoFamily, textTransform: "uppercase" };
  }
  if (style === "field-guide") {
    return { ...common, color: theme.secondary, fontFamily: theme.monoFamily, textTransform: "uppercase" };
  }
  if (style === "studio") {
    return { ...common, color: theme.muted, fontWeight: 640 };
  }
  return { ...common, textTransform: "uppercase" };
}

export function panelStyle(style: VideoStyle, theme: VideoTheme): CSSProperties {
  const common: CSSProperties = {
    backgroundColor: theme.panelStrong,
    border: `1px solid ${theme.border}`,
    boxShadow: theme.shadow,
  };

  if (style === "launch") {
    return {
      ...common,
      border: `2px solid ${theme.secondary}`,
      transform: "skewX(-6deg)",
    };
  }
  if (style === "neon") {
    return {
      ...common,
      boxShadow: `0 0 28px ${theme.border}`,
    };
  }
  if (style === "dashboard") {
    return {
      ...common,
      backgroundColor: theme.panel,
    };
  }
  if (style === "studio") {
    return {
      ...common,
      borderRadius: 34,
      backdropFilter: "blur(18px)",
    };
  }
  return common;
}

export function ProgressIndicator({
  style,
  theme,
  progress,
  left,
  right,
  top,
  bottom,
  segments,
  activeSegment = 0,
}: ProgressIndicatorProps) {
  const clampedProgress = clamp(progress);
  const position: CSSProperties = {
    position: "absolute",
    left,
    right,
    ...(top === undefined ? {} : { top }),
    ...(bottom === undefined ? {} : { bottom }),
  };

  if (style === "editorial") {
    return (
      <div
        style={{
          position: "absolute",
          left: Math.max(18, left - 42),
          top: top ?? 80,
          bottom: bottom ?? 80,
          width: 3,
          backgroundColor: theme.border,
        }}
      >
        <div
          style={{
            width: "100%",
            height: `${Math.round(clampedProgress * 100)}%`,
            backgroundColor: theme.accent,
          }}
        />
      </div>
    );
  }

  if (style === "field-guide" && segments && segments > 1) {
    return (
      <div style={{ ...position, display: "flex", gap: 16, alignItems: "center" }}>
        {Array.from({ length: segments }).map((_, index) => (
          <div
            key={index}
            style={{
              flex: 1,
              height: 18,
              border: `2px solid ${theme.border}`,
              backgroundColor: index <= activeSegment ? theme.accent : "transparent",
            }}
          />
        ))}
      </div>
    );
  }

  if (style === "launch") {
    return (
      <div
        style={{
          ...position,
          height: 22,
          backgroundColor: "rgba(255,246,240,0.18)",
          transform: "skewX(-16deg)",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.round(clampedProgress * 100)}%`,
            backgroundColor: theme.secondary,
          }}
        />
      </div>
    );
  }

  if (style === "studio") {
    return (
      <div
        style={{
          ...position,
          height: 6,
          backgroundColor: "rgba(16,17,20,0.1)",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.round(clampedProgress * 100)}%`,
            backgroundColor: theme.accent,
            borderRadius: 999,
          }}
        />
      </div>
    );
  }

  if (segments && segments > 1) {
    return (
      <div style={{ ...position, display: "flex", gap: style === "dashboard" ? 10 : 14 }}>
        {Array.from({ length: segments }).map((_, index) => (
          <div
            key={index}
            style={{
              flex: 1,
              height: style === "neon" ? 10 : 12,
              backgroundColor: index <= activeSegment ? theme.accent : theme.panel,
              border: `1px solid ${index <= activeSegment ? theme.accent : theme.border}`,
              boxShadow: style === "neon" && index <= activeSegment ? `0 0 16px ${theme.accent}` : undefined,
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      style={{
        ...position,
        height: style === "neon" ? 8 : 10,
        backgroundColor: theme.panel,
        border: `1px solid ${theme.border}`,
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${Math.round(clampedProgress * 100)}%`,
          backgroundColor: theme.accent,
          boxShadow: style === "neon" ? `0 0 18px ${theme.accent}` : undefined,
        }}
      />
    </div>
  );
}
