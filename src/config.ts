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
export const LABEL_RADIUS = GLOBE_RADIUS * 1.035;

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
};

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

export const LABEL = {
  /** Minimum inset from the frame edge for flag/name legibility in video. */
  safeAreaInset: 0.06,
};

export const starCount = 1400;