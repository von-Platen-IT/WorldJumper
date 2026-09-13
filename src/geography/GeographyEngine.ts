import { ShapeUtils, Vector2, Vector3 } from 'three';
import { BORDER_RADIUS, HIGHLIGHT_BORDER_RADIUS, LAND_RADIUS } from '../config';
import type { Country, CountryFeatureCollection, CountryIndexFile, CountryIndexEntry, PolygonRings } from '../data/types';
import { latLonToVector3, openRing, unwrapRing, type LngLat } from './geoProjection';

/**
 * Maximale Kantenlänge der Landdreiecke im Parameterraum, in Grad.
 *
 * Zwei Dinge müssen gleichzeitig erfüllt sein:
 *
 * 1. Ein Dreieck zwischen drei Punkten AUF der Kugel ist flach, seine
 *    Innenfläche liegt darunter ("Sehnendurchhang"). Ohne Unterteilung hing die
 *    Mitte großer Länder bis zu 0.176 Einheiten unter die Oberfläche – die
 *    Ozeankugel lag davor und verdeckte die Füllung, sodass nur die Ränder
 *    sichtbar blieben. Bei 2.5° Schrittweite beträgt der Durchhang nur ~0.0005
 *    und liegt damit weit unter dem Radius-Offset des Landes.
 *
 * 2. Die Unterteilung MUSS im Parameterraum (Längen-/Breitengrad) erfolgen,
 *    nicht über 3D-Mittelpunkte. Ein 3D-Mittelpunkt landet auf dem Großkreis;
 *    der weicht von der Längen-/Breitengradlinie ab und wölbt sich zum Pol.
 *    Russlands Innendreiecke spannen bis zu 104° Längengrad – über Großkreise
 *    unterteilt wuchs die gefüllte Fläche dort um 28% und lief über die
 *    Grenzen hinaus. Die Mittelpunkt-Unterteilung in der Ebene tilingt das
 *    Dreieck dagegen exakt, die Projektion erhält die Region also unverändert.
 */
const STEP_DEG = 2.5;

/**
 * Reichweite der Unterteilung als Sicherheitsnetz; die eigentliche Abbruch-
 * bedingung ist die Kantenlänge. Die Halbierung der längsten Kante ist eine
 * Bisektion, ein Pfad kann daher mehr Ebenen brauchen als log2(Kante/STEP).
 */
const MAX_REFINE_DEPTH = 20;

/**
 * Nur echt entartete Dreiecke (ohne Fläche) werden verworfen. Ein früherer
 * Filter verwarf zusätzlich alle Dreiecke mit schlechtem Seitenverhältnis
 * ("Splitter"). Da die Unterteilung ein Dreieck in ähnliche Kinder zerlegt,
 * blieben Splitter Splitter und wurden ausnahmslos verworfen – ganze
 * dünne Keile verschwanden aus der Fläche und gaben den dunklen Ozean frei
 * (bei Kanada 6.5% der Landesfläche). Deshalb wird hier nur noch die exakte
 * Entartung geprüft.
 */
const MIN_SLIVER_RATIO = 1e-6;

/** Lange Polygonkanten werden vorab unterteilt, damit auch Grenzlinien der Kugel folgen. */
const RING_MAX_STEP_DEG = 1.5;

export interface BuiltWorld {
  countries: Country[];
  /** Merged triangle soup of every landmass – one draw call for the whole world. */
  landPositions: Float32Array;
  landNormals: Float32Array;
  landIndices: Uint32Array;
  /** Merged line segments of every border – one draw call for all outlines. */
  borderPositions: Float32Array;
}

/** Ensures the outer ring is counter-clockwise and holes are clockwise. */
function orient(points: Vector2[], counterClockwise: boolean): Vector2[] {
  let area = 0;
  for (let i = 0, n = points.length; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    area += a.x * b.y - b.x * a.y;
  }
  const isCcw = area > 0;
  return isCcw === counterClockwise ? points : points.slice().reverse();
}

/** Unwrapped, opened ring mapped into the triangulation plane and oriented. */
function toContour(ring: LngLat[], counterClockwise: boolean): Vector2[] {
  return orient(
    ring.map((point) => new Vector2(point.lon, point.lat)),
    counterClockwise,
  );
}

/**
 * Splits every ring edge so no edge is longer than `maxStepDeg`. Returns a
 * closed ring (last point equals the first). This keeps borders, outlines and
 * fill consistent and prevents long chords from cutting through the sphere.
 */
export function densifyRing(ring: LngLat[], maxStepDeg = RING_MAX_STEP_DEG): LngLat[] {
  if (ring.length < 2) return ring.slice();
  const out: LngLat[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    out.push(a);
    const dLon = b.lon - a.lon;
    const dLat = b.lat - a.lat;
    const distance = Math.hypot(dLon, dLat);
    if (distance > maxStepDeg) {
      const steps = Math.ceil(distance / maxStepDeg);
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        out.push({ lon: a.lon + dLon * t, lat: a.lat + dLat * t });
      }
    }
  }
  return out;
}

interface PreparedPolygon {
  /** Closed, densified rings: outer[0] equals outer[outer.length - 1] – for borders. */
  outer: LngLat[];
  holes: LngLat[][];
  /**
   * Raw rings (not densified) for triangulation. Densification inserts points
   * exactly on straight edges; Earcut turns those collinear points into slivers
   * and the refinement explodes (about 8x the geometry for the same surface).
   * The fill follows the sphere anyway, because the refinement subdivides the
   * boundary edges afterwards.
   */
  contour: Vector2[];
  contours: Vector2[][];
}

function preparePolygon(rings: PolygonRings): PreparedPolygon | null {
  if (!rings.length || rings[0].length < 4) return null;
  const rawOuter = openRing(unwrapRing(rings[0]));
  if (rawOuter.length < 4) return null;
  const outer = densifyRing(rawOuter);
  if (outer.length < 4) return null;

  const holes: LngLat[][] = [];
  const contours: Vector2[][] = [];
  for (let i = 1; i < rings.length; i++) {
    if (rings[i].length < 4) continue;
    const rawHole = openRing(unwrapRing(rings[i]));
    if (rawHole.length < 4) continue;
    holes.push(densifyRing(rawHole));
    contours.push(toContour(rawHole, false));
  }
  return { outer, holes, contour: toContour(rawOuter, true), contours };
}

export function buildWorld(features: CountryFeatureCollection, index: CountryIndexFile): BuiltWorld {
  const metaById = new Map<string, CountryIndexEntry>(index.countries.map((c) => [c.id, c]));

  const landPositions: number[] = [];
  const landNormals: number[] = [];
  const landIndices: number[] = [];
  const borderPositions: number[] = [];
  const countries: Country[] = [];

  const tmp = new Vector3();

  /**
   * The hot path deliberately uses plain scalars instead of Vector3 objects.
   * The world mesh has ~360k triangles; allocating nine Vector3 per triangle
   * cost roughly three seconds of startup time.
   */
  const scratch = new Float64Array(9);
  let slot = 0;
  const degToRad = Math.PI / 180;

  const projectIntoScratch = (lon: number, lat: number): void => {
    const phi = (lon + 180) * degToRad;
    const polar = (90 - lat) * degToRad;
    const sinPolar = Math.sin(polar);
    scratch[slot++] = -LAND_RADIUS * sinPolar * Math.cos(phi);
    scratch[slot++] = LAND_RADIUS * Math.cos(polar);
    scratch[slot++] = LAND_RADIUS * sinPolar * Math.sin(phi);
  };

  /**
   * Emits the triangle currently held in `scratch`, flipping the winding if its
   * normal points towards the globe centre. 68 triangles in the raw data were
   * wound the wrong way and were culled as back faces, producing dark patches.
   *
   * Only genuinely degenerate triangles are dropped – see MIN_SLIVER_RATIO.
   */
  const flushTriangle = (): void => {
    const ax = scratch[0];
    const ay = scratch[1];
    const az = scratch[2];
    let bx = scratch[3];
    let by = scratch[4];
    let bz = scratch[5];
    let cx = scratch[6];
    let cy = scratch[7];
    let cz = scratch[8];

    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;

    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;

    const wx = cx - bx;
    const wy = cy - by;
    const wz = cz - bz;
    const longestSq = Math.max(
      ux * ux + uy * uy + uz * uz,
      wx * wx + wy * wy + wz * wz,
      vx * vx + vy * vy + vz * vz,
    );
    if (longestSq <= 0) return;
    if (Math.sqrt(nx * nx + ny * ny + nz * nz) / longestSq < MIN_SLIVER_RATIO) return;

    // Force the winding outwards. For genuine triangles the sign is stable; a
    // degenerate remainder is harmless because it covers no pixels.
    if (nx * (ax + bx + cx) + ny * (ay + by + cy) + nz * (az + bz + cz) < 0) {
      const tx = bx;
      const ty = by;
      const tz = bz;
      bx = cx;
      by = cy;
      bz = cz;
      cx = tx;
      cy = ty;
      cz = tz;
    }

    const index = landPositions.length / 3;
    landPositions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    landNormals.push(
      ax / LAND_RADIUS,
      ay / LAND_RADIUS,
      az / LAND_RADIUS,
      bx / LAND_RADIUS,
      by / LAND_RADIUS,
      bz / LAND_RADIUS,
      cx / LAND_RADIUS,
      cy / LAND_RADIUS,
      cz / LAND_RADIUS,
    );
    landIndices.push(index, index + 1, index + 2);
  };

  /**
   * Refines a triangle in parameter space until every edge is shorter than
   * STEP_DEG, then projects the leaves onto the sphere.
   *
   * The longest edge is bisected instead of splitting all three midpoints. A
   * four-way split produces children similar to the parent, so a thin triangle
   * stays thin through every level and the work explodes in the short
   * dimension. Bisecting the longest edge only refines the direction that is
   * actually too coarse, which keeps long, thin regions cheap while still
   * hugging the sphere.
   */
  const refine = (
    ax: number,
    ay: number,
    bx: number,
    by: number,
    cx: number,
    cy: number,
    depth: number,
  ): void => {
    const abx = bx - ax;
    const aby = by - ay;
    const bcx = cx - bx;
    const bcy = cy - by;
    const cax = ax - cx;
    const cay = ay - cy;
    const abSq = abx * abx + aby * aby;
    const bcSq = bcx * bcx + bcy * bcy;
    const caSq = cax * cax + cay * cay;

    if (depth <= 0 || Math.max(abSq, bcSq, caSq) <= STEP_DEG * STEP_DEG) {
      slot = 0;
      projectIntoScratch(ax, ay);
      projectIntoScratch(bx, by);
      projectIntoScratch(cx, cy);
      flushTriangle();
      return;
    }

    if (abSq >= bcSq && abSq >= caSq) {
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      refine(ax, ay, mx, my, cx, cy, depth - 1);
      refine(mx, my, bx, by, cx, cy, depth - 1);
    } else if (bcSq >= caSq) {
      const mx = (bx + cx) / 2;
      const my = (by + cy) / 2;
      refine(bx, by, mx, my, ax, ay, depth - 1);
      refine(mx, my, cx, cy, ax, ay, depth - 1);
    } else {
      const mx = (cx + ax) / 2;
      const my = (cy + ay) / 2;
      refine(cx, cy, mx, my, bx, by, depth - 1);
      refine(mx, my, ax, ay, bx, by, depth - 1);
    }
  };

  /** Builds border and outline segments from a closed ring. */
  const pushSegments = (ring: LngLat[], radius: number, into: number[]): void => {
    const count = ring.length;
    for (let i = 0; i < count; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % count];
      latLonToVector3(a.lat, a.lon, radius, tmp);
      into.push(tmp.x, tmp.y, tmp.z);
      latLonToVector3(b.lat, b.lon, radius, tmp);
      into.push(tmp.x, tmp.y, tmp.z);
    }
  };

  for (const feature of features.features) {
    const meta = metaById.get(feature.properties.id);
    if (!meta) continue;

    const vertexStart = landPositions.length / 3;
    const outline: number[] = [];

    for (const rings of feature.geometry.coordinates) {
      const polygon = preparePolygon(rings);
      if (!polygon) continue;

      // Triangulate the raw rings; the refinement hugs the sphere afterwards.
      const flat = [...polygon.contour, ...polygon.contours.flat()];
      const triangles = ShapeUtils.triangulateShape(polygon.contour, polygon.contours);
      for (const triangle of triangles) {
        const a = flat[triangle[0]];
        const b = flat[triangle[1]];
        const c = flat[triangle[2]];
        refine(a.x, a.y, b.x, b.y, c.x, c.y, MAX_REFINE_DEPTH);
      }

      // Border for the merged base layer, plus the outline used for emphasis.
      pushSegments(polygon.outer, BORDER_RADIUS, borderPositions);
      for (const hole of polygon.holes) pushSegments(hole, BORDER_RADIUS, borderPositions);

      pushSegments(polygon.outer, HIGHLIGHT_BORDER_RADIUS, outline);
      for (const hole of polygon.holes) pushSegments(hole, HIGHLIGHT_BORDER_RADIUS, outline);
    }

    const vertexCount = landPositions.length / 3 - vertexStart;
    if (vertexCount === 0) continue;

    countries.push({
      ...meta,
      vertexStart,
      vertexCount,
      outline: new Float32Array(outline),
    });
  }

  return {
    countries,
    landPositions: new Float32Array(landPositions),
    landNormals: new Float32Array(landNormals),
    landIndices: new Uint32Array(landIndices),
    borderPositions: new Float32Array(borderPositions),
  };
}

// Three slate-teal stops (linear 0..1), blended per country for a hand-tuned,
// non-noisy look. Hoisted to module scope: baseColorFor runs inside the
// per-frame highlight path and must not allocate.
const TONE_DARK = [0x12 / 255, 0x34 / 255, 0x41 / 255] as const;
const TONE_MID = [0x1c / 255, 0x4a / 255, 0x5a / 255] as const;
const TONE_LIGHT = [0x26 / 255, 0x64 / 255, 0x79 / 255] as const;

/** Deterministic per-country base tint so continents read as subtly varied terrain. */
export function baseColorFor(country: CountryIndexEntry, out: [number, number, number]): [number, number, number] {
  let hash = 2166136261;
  const key = country.iso3 ?? country.id;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const t = ((hash >>> 0) % 1000) / 1000;
  const from = t < 0.5 ? TONE_DARK : TONE_MID;
  const to = t < 0.5 ? TONE_MID : TONE_LIGHT;
  const k = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  out[0] = from[0] + (to[0] - from[0]) * k;
  out[1] = from[1] + (to[1] - from[1]) * k;
  out[2] = from[2] + (to[2] - from[2]) * k;
  return out;
}
