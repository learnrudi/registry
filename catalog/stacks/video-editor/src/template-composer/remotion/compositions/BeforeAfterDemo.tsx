import {
  Audio,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { labelStyle, panelStyle, ProgressIndicator, StyleFrame } from "../stylePrimitives.js";
import { resolveTheme, type VideoStyle } from "../theme.js";
import type { VideoFormat } from "../videoFormats.js";

export interface BeforeAfterData {
  title: string;
  subtitle?: string;
  before_label: string;
  after_label: string;
  proof?: string;
  caption?: string;
  cta?: string;
  accent_color?: string;
}

export interface BeforeAfterDemoProps {
  format: VideoFormat;
  style: VideoStyle;
  durationSeconds: number;
  data: BeforeAfterData;
  audioSrc: string | null;
  assetSrcs?: Record<string, string>;
}

function fitFontSize(text: string, base: number, min: number, maxChars: number): number {
  const longestWord = text.split(/\s+/).reduce((max, word) => Math.max(max, word.length), 0);
  return Math.max(min, base - Math.max(0, text.length - maxChars) * 1.35 - Math.max(0, longestWord - 13) * 4);
}

export const BeforeAfterDemo = ({
  format,
  style,
  data,
  audioSrc,
  assetSrcs = {},
}: BeforeAfterDemoProps) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const theme = resolveTheme(style, data.accent_color);
  const isLandscape = format === "landscape";
  const isSquare = format === "square";
  const isStory = format === "story";
  const margin = isLandscape ? 96 : isSquare ? 68 : 74;
  const contentWidth = width - margin * 2;
  const progress = Math.min(1, frame / durationInFrames);
  const reveal = spring({
    frame: frame - 8,
    fps,
    config: { damping: 20, stiffness: 115, mass: 0.72 },
  });
  const proofReveal = spring({
    frame: frame - Math.round(durationInFrames * 0.43),
    fps,
    config: { damping: 18, stiffness: 110, mass: 0.72 },
  });
  const exitFade = interpolate(frame, [durationInFrames - 22, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const beforeSrc = assetSrcs.before_image;
  const afterSrc = assetSrcs.after_image;
  const logoSrc = assetSrcs.logo;

  const imageHeight = isLandscape ? 250 : isSquare ? 390 : isStory ? 520 : 470;
  const splitColumns = "1fr";
  const titleSize = fitFontSize(data.title, isLandscape ? 66 : isSquare ? 54 : 64, 36, isLandscape ? 86 : 58);
  const proofSize = fitFontSize(data.proof ?? "", isLandscape ? 84 : isSquare ? 66 : 78, 42, isLandscape ? 32 : 22);

  const renderLogo = () =>
    logoSrc ? (
      <div
        style={{
          width: isLandscape ? 72 : 82,
          height: isLandscape ? 72 : 82,
          padding: 12,
          border: `1px solid ${theme.border}`,
          backgroundColor: theme.panelStrong,
          borderRadius: style === "studio" ? 20 : 0,
          boxShadow: style === "studio" ? "0 14px 46px rgba(16,17,20,0.14)" : undefined,
          overflow: "hidden",
        }}
      >
        <Img src={logoSrc} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </div>
    ) : null;

  const renderImageCard = (src: string | undefined, label: string, tone: "before" | "after") => (
    <div
      style={{
        ...panelStyle(style, theme),
        borderRadius: style === "studio" ? 38 : undefined,
        padding: style === "studio" ? 18 : 20,
        overflow: "hidden",
        transform: style === "launch" ? "skewX(-4deg)" : undefined,
      }}
    >
      <div style={{ transform: style === "launch" ? "skewX(4deg)" : undefined }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 20,
            marginBottom: 16,
            minHeight: 38,
            fontFamily: style === "studio" ? theme.fontFamily : theme.monoFamily,
            fontSize: isLandscape ? 22 : 24,
            fontWeight: style === "studio" ? 700 : 760,
            color: tone === "after" ? theme.accent : theme.muted,
          }}
        >
          <span>{label}</span>
          <span
            style={{
              width: 14,
              height: 14,
              borderRadius: style === "studio" ? 999 : 0,
              backgroundColor: tone === "after" ? theme.accent : theme.secondary,
              flex: "0 0 auto",
            }}
          />
        </div>
        <div
          style={{
            height: imageHeight,
            border: `1px solid ${theme.border}`,
            borderRadius: style === "studio" ? 28 : undefined,
            backgroundColor: style === "studio" || style === "editorial" ? "#ffffff" : "rgba(0,0,0,0.28)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {src ? (
            <Img
              src={src}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
              }}
            />
          ) : (
            <div
              style={{
                color: theme.muted,
                fontSize: 30,
                textAlign: "center",
                padding: 34,
              }}
            >
              Missing {tone} image
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <StyleFrame style={style} theme={theme} width={width} height={height} frame={frame}>
      {audioSrc ? <Audio src={audioSrc} /> : null}
      <ProgressIndicator
        style={style}
        theme={theme}
        left={margin}
        right={margin}
        top={isLandscape ? 54 : 72}
        progress={progress}
      />
      <div
        style={{
          position: "absolute",
          left: margin,
          right: margin,
          top: isLandscape ? 104 : isSquare ? 104 : 136,
          opacity: exitFade,
          transform: `translateY(${interpolate(reveal, [0, 1], [42, 0])}px)`,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isLandscape ? "minmax(500px, 0.58fr) minmax(620px, 1fr)" : "1fr",
            gap: isLandscape ? 58 : 34,
            alignItems: "start",
          }}
        >
          <div>
            {logoSrc ? <div style={{ marginBottom: 28 }}>{renderLogo()}</div> : null}
            <div
              style={{
                ...labelStyle(style, theme, isLandscape ? 28 : 30),
                marginBottom: 24,
              }}
            >
              Before / After
            </div>
            <div
              style={{
                fontSize: titleSize,
                lineHeight: 1.04,
                fontWeight: theme.weight,
                maxWidth: isLandscape ? 700 : contentWidth,
                overflowWrap: "break-word",
                letterSpacing: 0,
                textShadow: theme.textShadow,
              }}
            >
              {data.title}
            </div>
            {data.subtitle ? (
              <div
                style={{
                  marginTop: 28,
                  fontSize: isLandscape ? 28 : 34,
                  lineHeight: 1.24,
                  color: theme.muted,
                  maxWidth: isLandscape ? 620 : contentWidth,
                  overflowWrap: "break-word",
                }}
              >
                {data.subtitle}
              </div>
            ) : null}
            {data.proof ? (
              <div
                style={{
                  marginTop: isLandscape ? 48 : 36,
                  transform: `translateY(${interpolate(proofReveal, [0, 1], [34, 0])}px) scale(${interpolate(proofReveal, [0, 1], [0.92, 1])})`,
                  opacity: Math.min(1, proofReveal),
                  transformOrigin: "left center",
                }}
              >
                <div
                  style={{
                    display: "inline-block",
                    color: style === "studio" ? theme.accent : theme.foreground,
                    backgroundColor: style === "studio" ? "transparent" : theme.panelStrong,
                    borderBottom: style === "studio" ? `4px solid ${theme.accent}` : undefined,
                    borderLeft: style === "dashboard" || style === "field-guide" ? `10px solid ${theme.accent}` : undefined,
                    padding: style === "studio" ? "0 0 14px" : "18px 28px 22px",
                    fontSize: proofSize,
                    lineHeight: 0.98,
                    fontWeight: 860,
                    overflowWrap: "break-word",
                    maxWidth: "100%",
                    boxShadow: style === "studio" ? undefined : theme.shadow,
                  }}
                >
                  {data.proof}
                </div>
                {data.caption ? (
                  <div
                    style={{
                      marginTop: 20,
                      fontSize: isLandscape ? 24 : 30,
                      lineHeight: 1.22,
                      color: theme.muted,
                      maxWidth: isLandscape ? 560 : contentWidth,
                      overflowWrap: "break-word",
                    }}
                  >
                    {data.caption}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: splitColumns,
              gap: isLandscape ? 26 : 24,
              alignItems: "start",
            }}
          >
            {renderImageCard(beforeSrc, data.before_label, "before")}
            {renderImageCard(afterSrc, data.after_label, "after")}
          </div>
        </div>
      </div>
      {data.cta ? (
        <div
          style={{
            position: "absolute",
            left: margin,
            right: margin,
            bottom: isLandscape ? 52 : 80,
            display: "flex",
            justifyContent: isLandscape ? "flex-end" : "flex-start",
            opacity: interpolate(frame, [durationInFrames - 72, durationInFrames - 38], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <div
            style={{
              color: style === "studio" ? theme.accentText : theme.foreground,
              backgroundColor: theme.accent,
              borderRadius: style === "studio" ? 999 : undefined,
              padding: isLandscape ? "16px 28px" : "18px 30px",
              fontSize: isLandscape ? 24 : 30,
              fontWeight: 760,
              boxShadow: theme.shadow,
              overflowWrap: "break-word",
            }}
          >
            {data.cta}
          </div>
        </div>
      ) : null}
    </StyleFrame>
  );
};
