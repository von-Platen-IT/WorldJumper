import { LABEL, type FormatKey } from '../config';

/**
 * Pure layout maths for the flag/name card.
 *
 * Deliberately free of three.js scene state so it can be verified headlessly:
 * the smoke suite checks that the card always fits inside the safe area in both
 * formats, that its aspect ratio is preserved, and that its size does not depend
 * on how large the country is. The old implementation scaled the card with the
 * country's angular radius, which made large countries overflow the frame.
 */

/** Card aspect ratio, derived from the texture so both stay in sync. */
export const CARD_ASPECT = LABEL.canvasWidth / LABEL.canvasHeight;

export interface LabelLayout {
  /** Card width in world units at the card's distance from the camera. */
  width: number;
  /** Card height in world units at the card's distance from the camera. */
  height: number;
  /** Final card centre in normalised device coordinates, inside the safe area. */
  ndcX: number;
  ndcY: number;
}

const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

/**
 * @param visibleHeight World-space height of the frame at the card's distance.
 * @param aspect        Frame aspect ratio (width / height).
 * @param anchorNdcX    Projected country centre, x in [-1, 1].
 * @param anchorNdcY    Projected country centre, y in [-1, 1].
 */
export function computeLabelLayout(
  visibleHeight: number,
  aspect: number,
  format: FormatKey,
  anchorNdcX: number,
  anchorNdcY: number,
): LabelLayout {
  const visibleWidth = visibleHeight * aspect;

  const byWidth = visibleWidth * LABEL.widthFraction[format];
  const byHeight = visibleHeight * LABEL.maxHeightFraction * CARD_ASPECT;
  const width = Math.min(byWidth, byHeight);
  const height = width / CARD_ASPECT;

  // A world-space half extent maps to this many NDC units.
  const halfWidthNdc = width / visibleWidth;
  const halfHeightNdc = height / visibleHeight;
  const limit = 1 - LABEL.safeAreaInset;

  // Keep the whole card inside the safe area, not merely its centre.
  const minX = -limit + halfWidthNdc;
  const maxX = limit - halfWidthNdc;
  const minY = -limit + halfHeightNdc;
  const maxY = limit - halfHeightNdc;

  // Sit above the country so the card does not cover what it labels.
  const desiredY = anchorNdcY + (1 + 2 * LABEL.screenGap) * halfHeightNdc;

  return {
    width,
    height,
    // If the card were wider than the safe area, centre it rather than build an
    // inverted clamp range.
    ndcX: minX > maxX ? 0 : clamp(anchorNdcX, minX, maxX),
    ndcY: minY > maxY ? 0 : clamp(desiredY, minY, maxY),
  };
}
