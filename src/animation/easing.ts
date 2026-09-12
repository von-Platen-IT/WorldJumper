/** All easing curves used by the animation director live in one place. */

export type Easing = (t: number) => number;

export const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

export const linear: Easing = (t) => t;

export const easeInOutCubic: Easing = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export const easeInOutQuint: Easing = (t) =>
  t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;

export const easeOutCubic: Easing = (t) => 1 - Math.pow(1 - t, 3);

export const easeOutExpo: Easing = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

export const easeInCubic: Easing = (t) => t * t * t;

/** Camera moves start calm, accelerate through the middle, settle gently. */
export const cameraEase: Easing = easeInOutQuint;

/** Globe rotation is a touch snappier at the start for a confident feel. */
export const globeEase: Easing = easeInOutCubic;

export const fadeEase: Easing = easeInOutCubic;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;