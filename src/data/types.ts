export interface CountryIndexEntry {
  id: string;
  iso2: string | null;
  iso3: string | null;
  /** English name. */
  name: string;
  /** German display name. */
  nameDe: string;
  continent: string;
  lat: number;
  lon: number;
  /** Angular radius of the dominant landmass in radians. */
  angularRadius: number;
  /** Relative size of all landmasses combined. */
  solidAngle: number;
  /** Path relative to the site root, or null when no flag asset exists. */
  flag: string | null;
}

export interface CountryIndexFile {
  generatedAt: string;
  countries: CountryIndexEntry[];
}

export type Ring = [number, number][];

/** Polygon = [outerRing, ...holes] */
export type PolygonRings = Ring[];

export interface CountryFeature {
  type: 'Feature';
  properties: { id: string; iso2: string | null; iso3: string | null; name: string; nameDe: string };
  geometry: { type: 'MultiPolygon'; coordinates: PolygonRings[] };
}

export interface CountryFeatureCollection {
  type: 'FeatureCollection';
  features: CountryFeature[];
}

/** Visualised country = registry entry + prepared geometry bookkeeping. */
export interface Country extends CountryIndexEntry {
  /** Range inside the merged land vertex buffer, used for highlighting. */
  vertexStart: number;
  vertexCount: number;
  /** Line segment positions of the country outline, kept for the highlight layer. */
  outline: Float32Array;
}