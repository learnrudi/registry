import {
  Audio,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { resolveTheme, type VideoStyle } from "../theme.js";
import type { VideoFormat } from "../videoFormats.js";
import { labelStyle, panelStyle, ProgressIndicator, StyleFrame } from "../stylePrimitives.js";

export interface ProductDemoStep {
  label: string;
  headline: string;
  detail?: string;
  asset_key?: string;
}

export interface ProductDemoData {
  product: string;
  promise: string;
  steps: ProductDemoStep[];
  outro?: string;
  accent_color?: string;
}

export interface ProductDemoSequenceProps {
  format: VideoFormat;
  style: VideoStyle;
  durationSeconds: number;
  data: ProductDemoData;
  audioSrc: string | null;
  assetSrcs?: Record<string, string>;
}

function fitFontSize(text: string, base: number, min: number, maxChars: number): number {
  const longestWord = text.split(/\s+/).reduce((max, word) => Math.max(max, word.length), 0);
  return Math.max(min, base - Math.max(0, text.length - maxChars) * 1.4 - Math.max(0, longestWord - 14) * 4);
}

function stepAt(steps: ProductDemoStep[], index: number): ProductDemoStep {
  return steps[Math.max(0, Math.min(index, steps.length - 1))];
}

export const ProductDemoSequence = ({ format, style, data, audioSrc, assetSrcs = {} }: ProductDemoSequenceProps) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const theme = resolveTheme(style, data.accent_color);
  const isLandscape = format === "landscape";
  const isSquare = format === "square";
  const margin = isLandscape ? 104 : isSquare ? 76 : 82;
  const steps = data.steps.length > 0 ? data.steps : [];
  const sceneCount = Math.max(3, steps.length + 2);
  const sceneFrames = durationInFrames / sceneCount;
  const sceneIndex = Math.min(sceneCount - 1, Math.floor(frame / sceneFrames));
  const localFrame = frame - sceneIndex * sceneFrames;
  const localProgress = Math.max(0, Math.min(1, localFrame / sceneFrames));
  const reveal = spring({
    frame: localFrame,
    fps,
    config: { damping: 18, stiffness: 115, mass: 0.75 },
  });
  const fade = interpolate(localProgress, [0, 0.1, 0.9, 1], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const lift = interpolate(reveal, [0, 1], [46, 0]);
  const contentWidth = width - margin * 2;
  const logoSrc = assetSrcs.logo;
  const heroSrc = assetSrcs.hero_image;

  const assetForStep = (step: ProductDemoStep, index: number): string | null => {
    const key = step.asset_key ?? `screenshot_${index + 1}`;
    return assetSrcs[key] ?? null;
  };

  const renderLogo = (size: number) =>
    logoSrc ? (
      <div
        style={{
          width: size,
          height: size,
          backgroundColor: style === "editorial" || style === "field-guide" ? theme.panelStrong : "rgba(255,255,255,0.12)",
          border: `1px solid ${theme.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: Math.round(size * 0.14),
          overflow: "hidden",
        }}
      >
        <Img
          src={logoSrc}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
          }}
        />
      </div>
    ) : null;

  const renderAssetPanel = (src: string, label: string, mode: "hero" | "step") => {
    const panelHeight = mode === "hero" ? (isLandscape ? 420 : isSquare ? 360 : 500) : isLandscape ? 520 : isSquare ? 430 : 560;
    const chromeHeight = style === "dashboard" || style === "neon" ? 42 : 34;

    return (
      <div
        style={{
          ...panelStyle(style, theme),
          padding: style === "launch" ? 18 : 20,
          overflow: "hidden",
          transform: style === "launch" ? "skewX(-4deg)" : undefined,
        }}
      >
        <div style={{ transform: style === "launch" ? "skewX(4deg)" : undefined }}>
          <div
            style={{
              height: chromeHeight,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              marginBottom: 14,
              fontFamily: theme.monoFamily,
              color: style === "launch" ? theme.accentText : theme.muted,
              fontSize: isLandscape ? 18 : 20,
              overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", gap: 8 }}>
              {[theme.accent, theme.secondary, theme.border].map((color, index) => (
                <div key={index} style={{ width: 12, height: 12, backgroundColor: color }} />
              ))}
            </div>
            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
          </div>
          <div
            style={{
              height: panelHeight,
              backgroundColor: style === "editorial" || style === "field-guide" ? "#fffdf5" : "rgba(0,0,0,0.34)",
              border: `1px solid ${theme.border}`,
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Img
              src={src}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
              }}
            />
          </div>
        </div>
      </div>
    );
  };

  const renderIntro = () => (
    <div
      style={{
        position: "absolute",
        left: margin,
        right: margin,
        top: isLandscape ? 142 : isSquare ? 150 : 270,
        padding: style === "dashboard" || style === "field-guide" || style === "neon" ? "46px 52px" : undefined,
        ...(style === "dashboard" || style === "field-guide" || style === "neon" ? panelStyle(style, theme) : {}),
        opacity: fade,
        transform: `translateY(${lift}px)`,
      }}
    >
      <div
        style={{
          display: heroSrc && isLandscape ? "grid" : "block",
          gridTemplateColumns: heroSrc && isLandscape ? "1fr 560px" : undefined,
          gap: heroSrc && isLandscape ? 54 : undefined,
          alignItems: "center",
        }}
      >
        <div>
          {logoSrc ? <div style={{ marginBottom: 28 }}>{renderLogo(isLandscape ? 82 : 92)}</div> : null}
          <div
            style={{
              ...labelStyle(style, theme, isLandscape ? 30 : 34),
              marginBottom: 30,
            }}
          >
            {data.product}
          </div>
          <div
            style={{
              fontSize: fitFontSize(data.promise, isLandscape ? 76 : isSquare ? 64 : 78, 40, isLandscape ? 90 : 62),
              lineHeight: 1.05,
              fontWeight: theme.weight,
              maxWidth: heroSrc && isLandscape ? 760 : isLandscape ? 1180 : contentWidth,
              overflowWrap: "break-word",
              textShadow: theme.textShadow,
            }}
          >
            {data.promise}
          </div>
        </div>
        {heroSrc ? <div style={{ marginTop: isLandscape ? 0 : 42 }}>{renderAssetPanel(heroSrc, "Product preview", "hero")}</div> : null}
      </div>
    </div>
  );

  const renderStepBadge = (step: ProductDemoStep, index: number) => {
    if (style === "dashboard") {
      return (
        <div
          style={{
            ...panelStyle(style, theme),
            padding: "28px 30px",
            minHeight: isLandscape ? 360 : 240,
            fontFamily: theme.monoFamily,
          }}
        >
          <div style={{ color: theme.accent, fontSize: 24, marginBottom: 26 }}>STEP.{index + 1}</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 34 }}>
            {[0, 1, 2].map((dot) => (
              <div key={dot} style={{ width: 12, height: 12, backgroundColor: dot === 0 ? theme.accent : theme.border }} />
            ))}
          </div>
          {[0.82, 0.56, 0.68, 0.44].map((bar, barIndex) => (
            <div
              key={barIndex}
              style={{
                height: 18,
                width: `${Math.round(bar * 100)}%`,
                backgroundColor: barIndex === 0 ? theme.accent : theme.panelStrong,
                marginBottom: 18,
              }}
            />
          ))}
          <div style={{ color: theme.foreground, fontSize: isLandscape ? 42 : 48, fontWeight: 800, marginTop: 28 }}>
            {step.label}
          </div>
        </div>
      );
    }

    if (style === "launch") {
      return (
        <div
          style={{
            backgroundColor: theme.accent,
            color: theme.accentText,
            padding: "42px 38px",
            minHeight: isLandscape ? 360 : 240,
            transform: "skewX(-7deg)",
            boxShadow: theme.shadow,
          }}
        >
          <div style={{ transform: "skewX(7deg)" }}>
            <div style={{ fontSize: 26, fontWeight: 860, textTransform: "uppercase", marginBottom: 42 }}>
              Step {index + 1}
            </div>
            <div style={{ fontSize: isLandscape ? 62 : 68, lineHeight: 0.92, fontWeight: 940 }}>{step.label}</div>
          </div>
        </div>
      );
    }

    if (style === "field-guide") {
      return (
        <div
          style={{
            ...panelStyle(style, theme),
            borderLeft: `12px solid ${theme.accent}`,
            padding: "34px 34px",
            minHeight: isLandscape ? 360 : 240,
          }}
        >
          <div style={{ ...labelStyle(style, theme, 24), marginBottom: 30 }}>Checklist {index + 1}</div>
          {[step.label, "Verify", "Ship"].map((item, itemIndex) => (
            <div key={item} style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 22 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  border: `2px solid ${theme.accent}`,
                  backgroundColor: itemIndex === 0 ? theme.accent : "transparent",
                }}
              />
              <div style={{ fontSize: isLandscape ? 34 : 38, fontWeight: itemIndex === 0 ? 820 : 620 }}>{item}</div>
            </div>
          ))}
        </div>
      );
    }

    if (style === "neon") {
      return (
        <div
          style={{
            ...panelStyle(style, theme),
            padding: "32px 34px",
            minHeight: isLandscape ? 360 : 240,
            fontFamily: theme.monoFamily,
          }}
        >
          <div style={{ color: theme.secondary, fontSize: 22, marginBottom: 30 }}>RUN STEP_{index + 1}</div>
          <div
            style={{
              color: theme.accent,
              fontSize: isLandscape ? 52 : 58,
              lineHeight: 1,
              fontWeight: 900,
              textShadow: theme.textShadow,
            }}
          >
            {step.label}
          </div>
          <div style={{ marginTop: 40, borderTop: `1px solid ${theme.border}`, paddingTop: 24, color: theme.muted }}>
            STATUS: ARMED
          </div>
        </div>
      );
    }

    return (
      <div
        style={{
          ...panelStyle(style, theme),
          borderTop: `8px solid ${theme.accent}`,
          padding: "34px 38px",
          minHeight: isLandscape ? 360 : 240,
        }}
      >
        <div style={{ ...labelStyle(style, theme, 26), marginBottom: 28 }}>Step {index + 1}</div>
        <div style={{ fontSize: isLandscape ? 52 : 58, lineHeight: 1, fontWeight: 760 }}>{step.label}</div>
      </div>
    );
  };

  const renderStep = (step: ProductDemoStep, index: number) => {
    const assetSrc = assetForStep(step, index);

    return (
      <div
        style={{
          position: "absolute",
          left: margin,
          right: margin,
          top: isLandscape ? 104 : isSquare ? 108 : 170,
          opacity: fade,
          transform: `translateY(${lift}px)`,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isLandscape ? (assetSrc ? "minmax(620px, 0.95fr) 1fr" : "360px 1fr") : "1fr",
            gap: isLandscape ? 52 : 34,
            alignItems: "start",
          }}
        >
          {assetSrc ? renderAssetPanel(assetSrc, step.label, "step") : renderStepBadge(step, index)}
          <div>
            <div
              style={{
                ...labelStyle(style, theme, isLandscape ? 24 : 28),
                marginBottom: 26,
              }}
            >
              Step {index + 1} / {step.label}
            </div>
            <div
              style={{
                fontSize: fitFontSize(step.headline, isLandscape ? 58 : isSquare ? 52 : 60, 34, isLandscape ? 82 : 62),
                lineHeight: 1.07,
                fontWeight: theme.weight,
                overflowWrap: "break-word",
                textShadow: theme.textShadow,
              }}
            >
              {step.headline}
            </div>
            {step.detail ? (
              <div
                style={{
                  marginTop: 34,
                  fontSize: isLandscape ? 31 : 38,
                  lineHeight: 1.24,
                  color: theme.muted,
                  maxWidth: isLandscape ? 820 : contentWidth,
                  overflowWrap: "break-word",
                }}
              >
                {step.detail}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  const renderOutro = () => (
    <div
      style={{
        position: "absolute",
        left: margin,
        right: margin,
        top: isLandscape ? 210 : isSquare ? 245 : 430,
        padding: style === "dashboard" || style === "field-guide" || style === "neon" ? "44px 52px" : undefined,
        ...(style === "dashboard" || style === "field-guide" || style === "neon" ? panelStyle(style, theme) : {}),
        opacity: fade,
        transform: `translateY(${lift}px)`,
      }}
      >
        {logoSrc ? <div style={{ marginBottom: 30 }}>{renderLogo(isLandscape ? 72 : 84)}</div> : null}
      <div
        style={{
          ...labelStyle(style, theme, 34),
          marginBottom: 36,
        }}
      >
        Ready
      </div>
      <div
        style={{
          fontSize: fitFontSize(data.outro ?? data.promise, isLandscape ? 76 : isSquare ? 62 : 76, 40, isLandscape ? 90 : 58),
          lineHeight: 1.06,
          fontWeight: theme.weight,
          maxWidth: isLandscape ? 1120 : contentWidth,
          overflowWrap: "break-word",
          textShadow: theme.textShadow,
        }}
      >
        {data.outro ?? data.promise}
      </div>
    </div>
  );

  const stepScene = sceneIndex - 1;

  return (
    <StyleFrame style={style} theme={theme} width={width} height={height} frame={frame}>
      {audioSrc ? <Audio src={audioSrc} /> : null}
      <ProgressIndicator
        style={style}
        theme={theme}
        left={margin}
        right={margin}
        top={isLandscape ? 56 : 72}
        progress={(sceneIndex + localProgress) / sceneCount}
        segments={sceneCount}
        activeSegment={sceneIndex}
      />
      {sceneIndex === 0
        ? renderIntro()
        : sceneIndex >= sceneCount - 1
          ? renderOutro()
          : renderStep(stepAt(steps, stepScene), stepScene)}
      <div
        style={{
          position: "absolute",
          right: -Math.round(width * 0.09),
          bottom: -Math.round(height * 0.08),
          width: Math.round(width * 0.36),
          height: Math.round(height * 0.26),
          border: `3px solid ${theme.panel}`,
          transform: "rotate(-16deg)",
          opacity: style === "editorial" || style === "field-guide" ? 0.45 : 1,
        }}
      />
    </StyleFrame>
  );
};
