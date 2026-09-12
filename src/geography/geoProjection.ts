import { Vector3 } from 'three';

const DEG = Math.PI / 180;

/**
 * Projects geographic coordinates onto a sphere using exactly the same
 * convention as three.js `SphereGeometry`, so an equirectangular texture would
 * align with the country geometry.
 *
 * lon = -180 .. 180 (west .. east), lat = -90 .. 90 (south .. north).
 */
export function latLonToVector3(lat: number, lon: number, radius: number, target = new Vector3()): Vector3 {
  const phi = (lon + 180) * DEG;
  const polar = (90 - lat) * DEG;
  const sinPolar = Math.sin(polar);
  return target.set(-radius * sinPolar * Math.cos(phi), radius * Math.cos(polar), radius * sinPolar * Math.sin(phi));
}

export interface LngLat {
  lon: number;
  lat: number;
}

/**
 * Removes antimeridian jumps from a ring by choosing, for every point, the
 * longitude representation closest to the previous one. The result may exceed
 * ±180° which is harmless because the trigonometric projection is periodic.
 */
export function unwrapRing(ring: readonly number[][]): LngLat[] {
  const out: LngLat[] = [];
  let offset = 0;
  let prevLon = 0;
  for (let i = 0; i < ring.length; i++) {
    const lon = ring[i][0];
    const lat = ring[i][1];
    if (i === 0) {
      offset = 0;
    } else {
      const delta = lon - prevLon;
      if (delta > 180) offset -= 360;
      else if (delta < -180) offset += 360;
    }
    out.push({ lon: lon + offset, lat });
    prevLon = lon;
  }
  return out;
}

/** Drops a duplicated closing point so triangulation sees a clean ring. */
export function openRing(points: readonly LngLat[]): LngLat[] {
  if (points.length > 1) {
    const first = points[0];
    const last = points[points.length - 1];
    if (Math.abs(first.lon - last.lon) < 1e-6 && Math.abs(first.lat - last.lat) < 1e-6) {
      return points.slice(0, -1);
    }
  }
  return points.slice();
}

/** Converts a latitude/longitude pair back into the world direction vector. */
export function latLonToDirection(lat: number, lon: number, target = new Vector3()): Vector3 {
  return latLonToVector3(lat, lon, 1, target).normalize();
}