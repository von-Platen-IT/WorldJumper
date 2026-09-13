/**
 * Central configuration. Every tunable value of the film look lives here so the
 * animation stays deterministic and easy to reason about.
 */

export const GLOBE_RADIUS = 2;

/**
 * Land sits a hair above the ocean sphere to avoid z-fighting. The offset must
 * stay larger than the "chord sag" of the tallest land triangle (see
 * GeographyEngine.MAX_TRIANGLE_CHORD), otherwise the ocean sphere would cover
 * the interior of large countries again.
 */
export const LAND_RADIUS = GLOBE_RADIUS * 1.004;
export const BORDER_RADIUS = GLOBE_RADIUS * 1.009;
export const HIGHLIGHT_BORDER_RADIUS = GLOBE_RADIUS * 1.015;

/** Never render above this factor – a crisp Full-HD preview beats a heavy retina buffer. */
export const MAX_PIXEL_RATIO = 1.5;

export const COLORS = {
  space: 0x03050d,
  nebula: 0x0b1430,
  ocean: 0x0a1d33,
  oceanDeep: 0x050e1c,
  land: 0x1c4a5a,
  landLight: 0x266479,
  landDark: 0x123441,
  border: 0x5aa6bd,
  highlight: 0xf2b544,
  highlightBorder: 0xffd98a,
  atmosphere: 0x3f7fd6,
  star: 0xf2f6ff,
};

export const TIMING = {
  /** Mandatory calm second after the user confirms a selection. */
  pauseBeforeAction: 1000,
  /** Camera pulls back so the whole globe is recognisable again. */
  prepareGlobe: 850,
  /** Globe rotates the target into the camera axis. */
  orientToCountry: 1450,
  /** Camera closes in while highlight and label fade in. */
  zoomToCountry: 2100,
  /** Fixed breath between two countries of a sequence. */
  sequencePause: 1000,
  /**
   * Time the finished shot stays untouched before the search mask returns, so
   * the label can actually be read before it is covered again.
   */
  maskAfterHold: 1000,
};

/**
 * Fade duration of the search mask. Mirrored into CSS as `--panel-fade` at boot
 * so the transition and the code waiting for it cannot drift apart.
 */
export const PANEL_FADE_MS = 480;

/** Idle spin: a full revolution every ~24 seconds. */
export const IDLE_SPIN_SPEED = (Math.PI * 2) / 24000;

export interface CameraProfile {
  fov: number;
  idleDistance: number;
  minDistance: number;
  maxDistance: number;
  /** How much of the frame the target should occupy. */
  fitSafety: number;
  /** Slight vertical composition offset as a fraction of the distance. */
  centerOffsetY: number;
}

export const CAMERA_PROFILES: Record<'landscape' | 'portrait', CameraProfile> = {
  landscape: {
    fov: 42,
    idleDistance: 6.6,
    minDistance: GLOBE_RADIUS * 1.42,
    maxDistance: 6.6,
    fitSafety: 1.25,
    centerOffsetY: 0,
  },
  portrait: {
    fov: 42,
    idleDistance: 7.6,
    minDistance: GLOBE_RADIUS * 1.5,
    maxDistance: 7.6,
    fitSafety: 1.35,
    centerOffsetY: 0.02,
  },
};

export type FormatKey = 'landscape' | 'portrait';

export const FORMATS: Record<FormatKey, { width: number; height: number; label: string }> = {
  landscape: { width: 1920, height: 1080, label: 'Landscape 16:9' },
  portrait: { width: 1080, height: 1920, label: 'Portrait 9:16' },
};

/**
 * The flag/name card. It stays anchored to the country but is drawn parallel to
 * the image plane, so its text is always horizontal and its size is measured in
 * fractions of the frame instead of the country's angular radius. That is what
 * keeps small and large countries equally readable and always inside the frame.
 */
export const LABEL = {
  /** Card texture size; its aspect ratio is the card's aspect ratio. */
  canvasWidth: 1024,
  canvasHeight: 416,
  /** Minimum inset from the frame edge for flag/name legibility in video. */
  safeAreaInset: 0.06,
  /** Card width as a fraction of the visible frame width, per format. */
  widthFraction: { landscape: 0.3, portrait: 0.6 } as Record<FormatKey, number>,
  /** Upper bound as a fraction of the visible frame height, for flat formats. */
  maxHeightFraction: 0.22,
  /**
   * Gap between the country's centre and the card's lower edge, in card
   * heights. Keeps the card from covering the country it labels.
   */
  screenGap: 0.6,
  /** Distance of the card above the globe surface, relative to the globe radius. */
  radiusFactor: 1.035,
};

export const starCount = 1400;