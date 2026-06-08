export type VideoFormat = "story" | "landscape" | "square" | "portrait";

export const VIDEO_FORMATS: Record<VideoFormat, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  landscape: { width: 1920, height: 1080 },
  square: { width: 1080, height: 1080 },
  portrait: { width: 1080, height: 1350 },
};

export function normalizeVideoFormat(value: unknown): VideoFormat {
  return typeof value === "string" && value in VIDEO_FORMATS ? (value as VideoFormat) : "story";
}

export function normalizeDurationSeconds(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}
