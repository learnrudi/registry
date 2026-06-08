export type VideoStyle = "editorial" | "dashboard" | "launch" | "field-guide" | "neon" | "studio";

export interface VideoTheme {
  background: string;
  wash: string;
  foreground: string;
  muted: string;
  panel: string;
  panelStrong: string;
  border: string;
  accent: string;
  secondary: string;
  accentText: string;
  weight: number;
  label: string;
  fontFamily: string;
  monoFamily: string;
  shadow: string;
  textShadow?: string;
}

const THEMES: Record<VideoStyle, VideoTheme> = {
  editorial: {
    background: "#f4efe4",
    wash: "linear-gradient(90deg, rgba(179,66,45,0.12), rgba(244,239,228,0) 24%), repeating-linear-gradient(0deg, rgba(24,32,39,0.045) 0 1px, transparent 1px 72px)",
    foreground: "#182027",
    muted: "#5f675f",
    panel: "rgba(255,252,242,0.7)",
    panelStrong: "rgba(255,252,242,0.92)",
    border: "rgba(24,32,39,0.18)",
    accent: "#b3422d",
    secondary: "#0b6f75",
    accentText: "#fff9ef",
    weight: 760,
    label: "Editorial",
    fontFamily: 'Georgia, "Times New Roman", ui-serif, serif',
    monoFamily: '"IBM Plex Mono", "SFMono-Regular", Consolas, monospace',
    shadow: "0 22px 70px rgba(24,32,39,0.16)",
  },
  dashboard: {
    background: "#07110f",
    wash: "linear-gradient(135deg, rgba(53,229,157,0.16), rgba(7,17,15,0) 34%), repeating-linear-gradient(90deg, rgba(53,229,157,0.08) 0 1px, transparent 1px 96px), repeating-linear-gradient(0deg, rgba(53,229,157,0.08) 0 1px, transparent 1px 96px)",
    foreground: "#e9fff6",
    muted: "#91afa2",
    panel: "rgba(16,51,43,0.72)",
    panelStrong: "rgba(18,76,61,0.86)",
    border: "rgba(53,229,157,0.34)",
    accent: "#35e59d",
    secondary: "#ffd166",
    accentText: "#04110d",
    weight: 800,
    label: "Dashboard",
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    monoFamily: '"IBM Plex Mono", "SFMono-Regular", Consolas, monospace',
    shadow: "0 18px 70px rgba(0,0,0,0.28)",
  },
  launch: {
    background: "#1b0b12",
    wash: "linear-gradient(135deg, rgba(255,77,109,0.24), rgba(27,11,18,0) 38%), linear-gradient(20deg, rgba(255,209,102,0.2), rgba(27,11,18,0) 62%)",
    foreground: "#fff6f0",
    muted: "#ffd4dc",
    panel: "rgba(255,77,109,0.16)",
    panelStrong: "rgba(255,77,109,0.28)",
    border: "rgba(255,209,102,0.42)",
    accent: "#ff4d6d",
    secondary: "#ffd166",
    accentText: "#190911",
    weight: 880,
    label: "Launch",
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    monoFamily: '"IBM Plex Mono", "SFMono-Regular", Consolas, monospace',
    shadow: "0 26px 90px rgba(255,77,109,0.22)",
  },
  "field-guide": {
    background: "#ece4cc",
    wash: "repeating-linear-gradient(0deg, rgba(95,127,47,0.12) 0 2px, transparent 2px 78px), linear-gradient(145deg, rgba(183,93,49,0.12), rgba(236,228,204,0) 42%)",
    foreground: "#25301e",
    muted: "#61704b",
    panel: "rgba(255,251,232,0.72)",
    panelStrong: "rgba(255,251,232,0.94)",
    border: "rgba(95,127,47,0.28)",
    accent: "#5f7f2f",
    secondary: "#b75d31",
    accentText: "#fffbe8",
    weight: 780,
    label: "Field Guide",
    fontFamily: '"Avenir Next", Inter, ui-sans-serif, system-ui, sans-serif',
    monoFamily: '"IBM Plex Mono", "SFMono-Regular", Consolas, monospace',
    shadow: "0 18px 55px rgba(37,48,30,0.14)",
  },
  neon: {
    background: "#050612",
    wash: "linear-gradient(135deg, rgba(46,249,240,0.2), rgba(5,6,18,0) 36%), linear-gradient(35deg, rgba(255,61,242,0.14), rgba(5,6,18,0) 68%), repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0 1px, transparent 1px 5px)",
    foreground: "#f2f6ff",
    muted: "#aab3ff",
    panel: "rgba(46,249,240,0.1)",
    panelStrong: "rgba(46,249,240,0.18)",
    border: "rgba(46,249,240,0.58)",
    accent: "#2ef9f0",
    secondary: "#ff3df2",
    accentText: "#050612",
    weight: 880,
    label: "Neon",
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    monoFamily: '"IBM Plex Mono", "SFMono-Regular", Consolas, monospace',
    shadow: "0 0 34px rgba(46,249,240,0.28)",
    textShadow: "0 0 22px rgba(46,249,240,0.32)",
  },
  studio: {
    background: "#f7f8fb",
    wash: "radial-gradient(circle at 50% 18%, rgba(255,255,255,0.96), rgba(232,236,244,0.82) 46%, rgba(205,212,225,0.58) 100%)",
    foreground: "#101114",
    muted: "#626874",
    panel: "rgba(255,255,255,0.68)",
    panelStrong: "rgba(255,255,255,0.9)",
    border: "rgba(16,17,20,0.12)",
    accent: "#0071e3",
    secondary: "#8e8e93",
    accentText: "#ffffff",
    weight: 760,
    label: "Studio",
    fontFamily:
      'Inter, -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", ui-sans-serif, system-ui, sans-serif',
    monoFamily: '"SFMono-Regular", "IBM Plex Mono", Consolas, monospace',
    shadow: "0 34px 110px rgba(16,17,20,0.18)",
  },
};

export function resolveTheme(style: VideoStyle, accentOverride?: string): VideoTheme {
  const theme = THEMES[style] ?? THEMES.editorial;
  return accentOverride ? { ...theme, accent: accentOverride } : theme;
}
