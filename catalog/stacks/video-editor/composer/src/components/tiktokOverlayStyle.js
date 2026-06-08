export const TIKTOK_REFERENCE_WIDTH = 1080;
export const TIKTOK_REFERENCE_HEIGHT = 1920;

export const TIKTOK_FONT_STACK = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif';

const REFERENCE_SAFE_AREA = {
  left: 40,
  right: 150,
  top: 130,
  bottom: 300
};

function frameScale(width, height) {
  const widthScale = Number.isFinite(width) && width > 0
    ? width / TIKTOK_REFERENCE_WIDTH
    : 1;
  const heightScale = Number.isFinite(height) && height > 0
    ? height / TIKTOK_REFERENCE_HEIGHT
    : 1;
  const scale = Math.min(widthScale, heightScale);
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

export function scaledPx(value, width, height, minimum = 1) {
  return Math.max(minimum, Math.round(value * frameScale(width, height)));
}

export function getTikTokSafeArea(width = TIKTOK_REFERENCE_WIDTH, height = TIKTOK_REFERENCE_HEIGHT) {
  const left = scaledPx(REFERENCE_SAFE_AREA.left, width, height);
  const right = scaledPx(REFERENCE_SAFE_AREA.right, width, height);
  const top = scaledPx(REFERENCE_SAFE_AREA.top, width, height);
  const bottom = scaledPx(REFERENCE_SAFE_AREA.bottom, width, height);
  const frameWidth = Number.isFinite(width) && width > 0 ? Math.round(width) : TIKTOK_REFERENCE_WIDTH;
  const frameHeight = Number.isFinite(height) && height > 0 ? Math.round(height) : TIKTOK_REFERENCE_HEIGHT;

  return {
    scale: frameScale(frameWidth, frameHeight),
    left,
    right,
    top,
    bottom,
    contentWidth: Math.max(1, frameWidth - left - right),
    contentHeight: Math.max(1, frameHeight - top - bottom)
  };
}

export function getTextOverlayPlacement(position = 'bottom', width, height) {
  const safeArea = getTikTokSafeArea(width, height);
  const base = {
    position: 'absolute',
    left: safeArea.left,
    right: safeArea.right,
    maxWidth: safeArea.contentWidth,
    display: 'flex',
    alignItems: 'flex-start',
    pointerEvents: 'none'
  };

  if (position === 'top-left') {
    return {
      ...base,
      top: safeArea.top,
      bottom: 'auto',
      justifyContent: 'flex-start',
      textAlign: 'left'
    };
  }

  if (position === 'top') {
    return {
      ...base,
      top: safeArea.top,
      bottom: 'auto',
      justifyContent: 'center',
      textAlign: 'center'
    };
  }

  if (position === 'top-lower') {
    return {
      ...base,
      top: safeArea.top + scaledPx(70, width, height),
      bottom: 'auto',
      justifyContent: 'center',
      textAlign: 'center'
    };
  }

  return {
    ...base,
    top: 'auto',
    bottom: safeArea.bottom,
    justifyContent: 'center',
    textAlign: 'center'
  };
}

export function getPillTextStyle(size = 'default', width, height) {
  const fontSize = size === 'small'
    ? scaledPx(40, width, height, 18)
    : scaledPx(52, width, height, 22);

  return {
    display: 'inline-block',
    maxWidth: '100%',
    padding: `${scaledPx(10, width, height)}px ${scaledPx(18, width, height)}px`,
    borderRadius: scaledPx(14, width, height),
    background: '#ffffff',
    color: '#0b0b0b',
    fontFamily: TIKTOK_FONT_STACK,
    fontSize,
    fontWeight: 800,
    lineHeight: 1.08,
    letterSpacing: 0,
    textAlign: 'inherit',
    overflowWrap: 'break-word',
    whiteSpace: 'normal',
    boxShadow: `0 ${scaledPx(4, width, height)}px ${scaledPx(12, width, height)}px rgba(0, 0, 0, 0.18)`
  };
}

export function getCaptionTextStyle(width, height) {
  return {
    display: 'inline-block',
    maxWidth: '100%',
    color: '#ffffff',
    fontFamily: TIKTOK_FONT_STACK,
    fontSize: scaledPx(40, width, height, 20),
    fontWeight: 800,
    lineHeight: 1.12,
    letterSpacing: 0,
    textAlign: 'inherit',
    overflowWrap: 'break-word',
    whiteSpace: 'normal',
    WebkitTextStroke: `${scaledPx(1, width, height)}px rgba(0, 0, 0, 0.34)`,
    textShadow: [
      `0 ${scaledPx(2, width, height)}px ${scaledPx(4, width, height)}px rgba(0, 0, 0, 0.72)`,
      `0 0 ${scaledPx(10, width, height)}px rgba(0, 0, 0, 0.62)`
    ].join(', ')
  };
}
