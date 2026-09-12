/**
 * Headless verification of the data-driven core: geometry building, spherical
 * orientation maths and the country registry. Bundled with esbuild and executed
 * in Node – no browser or WebGL required.
 *
 * Usage: npm run smoke
 */
import { Vector3 } from 'three';
import { GLOBE_RADIUS, LAND_RADIUS } from '../src/config';
import { CountryRegistry } from '../src/data/CountryRegistry';
import type { CountryFeatureCollection, CountryIndexFile } from '../src/data/types';
import { buildWorld, densifyRing } from '../src/geography/GeographyEngine';
import { latLonToDirection, openRing, unwrapRing } from '../src/geography/geoProjection';
import { orientationForDirection } from '../src/geography/orientation';
import { readFileSync } from 'node:fs';

const load = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

let failures = 0;
function check(name: string, condition: boolean, detail = ''): void {
  const mark = condition ? '✓' : '✗';
  if (!condition) failures++;
  console.log(`${mark} ${name}${detail ? `  (${detail})` : ''}`);
}

const features = load<CountryFeatureCollection>('public/data/countries.geojson');
const index = load<CountryIndexFile>('public/data/country-index.json');
const world = buildWorld(features, index);

check('countries built', world.countries.length === features.features.length, `${world.countries.length}`);
check('land vertices present', world.landPositions.length > 0, `${world.landPositions.length / 3} vertices`);
check('land indices valid', world.landIndices.length > 0 && world.landIndices.length % 3 === 0, `${world.landIndices.length / 3} triangles`);
check('borders present', world.borderPositions.length > 0, `${world.borderPositions.length / 6} segments`);
check(
  'no NaN in land positions',
  !world.landPositions.some((v) => Number.isNaN(v)),
);
const firstVertexRadius = Math.hypot(
  world.landPositions[0],
  world.landPositions[1],
  world.landPositions[2],
);
check(
  'land vertices sit on the land radius',
  Math.abs(firstVertexRadius - LAND_RADIUS) < 1e-3,
  `r=${firstVertexRadius.toFixed(4)}`,
);

// --- Regressionsschutz gegen den "dunkle Flecken"-Fehler -------------------
// Ein flaches Dreieck zwischen drei Punkten auf der Kugel hängt in der Mitte
// unter die Oberfläche. Ist dieser Durchhang größer als der Radius-Offset des
// Landes, verdeckt die Ozeankugel die Füllung großer Länder.
const triangles = world.landIndices.length / 3;
let maxChord = 0;
for (let i = 0; i < world.landIndices.length; i += 3) {
  const p = [0, 1, 2].map(
    (k) =>
      new Vector3(
        world.landPositions[world.landIndices[i + k] * 3],
        world.landPositions[world.landIndices[i + k] * 3 + 1],
        world.landPositions[world.landIndices[i + k] * 3 + 2],
      ),
  );
  maxChord = Math.max(maxChord, p[0].distanceTo(p[1]), p[1].distanceTo(p[2]), p[2].distanceTo(p[0]));
}
const maxAngle = 2 * Math.asin(Math.min(1, maxChord / (2 * LAND_RADIUS)));
const maxSag = LAND_RADIUS * (1 - Math.cos(maxAngle / 2));
const offsetMargin = LAND_RADIUS - GLOBE_RADIUS;
check(
  'no oversized land triangles',
  maxChord < 0.12,
  `max chord=${maxChord.toFixed(4)} (${((maxAngle * 180) / Math.PI).toFixed(2)} deg)`,
);
check(
  'chord sag stays below the land offset',
  maxSag < offsetMargin,
  `sag=${maxSag.toFixed(5)} < offset=${offsetMargin.toFixed(4)} (${(offsetMargin / maxSag).toFixed(0)}x margin)`,
);
check('land tessellation is meaningful', triangles > 10000, `${triangles} triangles`);

// Jedes Dreieck muss nach außen zeigen, sonst wird es als Rückseite gecullt.
let inward = 0;
for (let i = 0; i < world.landIndices.length; i += 3) {
  const a = new Vector3(
    world.landPositions[world.landIndices[i] * 3],
    world.landPositions[world.landIndices[i] * 3 + 1],
    world.landPositions[world.landIndices[i] * 3 + 2],
  );
  const b = new Vector3(
    world.landPositions[world.landIndices[i + 1] * 3],
    world.landPositions[world.landIndices[i + 1] * 3 + 1],
    world.landPositions[world.landIndices[i + 1] * 3 + 2],
  );
  const c = new Vector3(
    world.landPositions[world.landIndices[i + 2] * 3],
    world.landPositions[world.landIndices[i + 2] * 3 + 1],
    world.landPositions[world.landIndices[i + 2] * 3 + 2],
  );
  const normal = b.clone().sub(a).cross(c.clone().sub(a));
  const centre = a.clone().add(b).add(c);
  if (normal.dot(centre) < 0) inward++;
}
check('all land triangles face outwards', inward === 0, `${inward} inward of ${triangles}`);

// --- Füllung: Kugeloberfläche des Meshes vs. Fläche des Länderpolygons -----
// Regressionsschutz gegen den "dunkle Flecken"-Fehler: Wäre die Innenfläche
// nicht gefüllt (Sehnendurchhang hinter der Ozeankugel, fehlende Dreiecke,
// weggecullte Rückseiten), müsste die Mesh-Fläche deutlich zu klein sein.
const sphericalTriangle = (a: Vector3, b: Vector3, c: Vector3): number => {
  const au = a.clone().normalize();
  const bu = b.clone().normalize();
  const cu = c.clone().normalize();
  const numerator = Math.abs(au.dot(bu.clone().cross(cu)));
  const denominator = 1 + au.dot(bu) + bu.dot(cu) + cu.dot(au);
  return 2 * Math.atan2(numerator, denominator);
};

const triangleVertex = (vertexIndex: number): Vector3 =>
  new Vector3(
    world.landPositions[vertexIndex * 3],
    world.landPositions[vertexIndex * 3 + 1],
    world.landPositions[vertexIndex * 3 + 2],
  );

const meshSolidAngle = (countryId: string): number => {
  const country = world.countries.find((c) => c.id === countryId);
  if (!country) return 0;
  const startVertex = country.vertexStart;
  const endVertex = country.vertexStart + country.vertexCount;
  let total = 0;
  for (let i = 0; i < world.landIndices.length; i += 3) {
    if (world.landIndices[i] < startVertex || world.landIndices[i] >= endVertex) continue;
    total += sphericalTriangle(
      triangleVertex(world.landIndices[i]),
      triangleVertex(world.landIndices[i + 1]),
      triangleVertex(world.landIndices[i + 2]),
    );
  }
  return total;
};

// Ground truth via Scanline-Integration über ein Breitengrad-Raster.
//
// Der naheliegende Flächenvektor-Algorithmus (|Σ p×q|/2) ist hier NICHT als
// Maßstab geeignet: er approximiert die Kanten durch Großkreise, während die
// Natural-Earth-Daten geraden Längen-/Breitengradlinien folgen. Bei Russland
// unterschätzt er die Fläche dadurch um 5.4%. Die Integration über
// cos(lat)·dLon·dLat ist davon unabhängig und konvergiert.
const degToRad = Math.PI / 180;

const scanlineSolidAngle = (rings: { lon: number; lat: number }[][], stepDeg = 0.05): number => {
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const ring of rings) {
    for (const point of ring) {
      minLat = Math.min(minLat, point.lat);
      maxLat = Math.max(maxLat, point.lat);
    }
  }
  if (!Number.isFinite(minLat)) return 0;

  const stepRad = stepDeg * degToRad;
  const crossings: number[] = [];
  let area = 0;
  for (let lat = minLat + stepDeg / 2; lat < maxLat; lat += stepDeg) {
    crossings.length = 0;
    // Even-Odd über alle Ringe gemeinsam behandelt Löcher korrekt.
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        if (a.lat > lat !== b.lat > lat) {
          crossings.push(a.lon + ((lat - a.lat) * (b.lon - a.lon)) / (b.lat - a.lat));
        }
      }
    }
    crossings.sort((p, q) => p - q);
    let width = 0;
    for (let i = 0; i + 1 < crossings.length; i += 2) width += crossings[i + 1] - crossings[i];
    area += Math.cos(lat * degToRad) * width * degToRad * stepRad;
  }
  return area;
};

const countryRings = (countryId: string): { lon: number; lat: number }[][] => {
  const feature = features.features.find((f) => f.properties.id === countryId);
  if (!feature) return [];
  const rings: { lon: number; lat: number }[][] = [];
  for (const polygon of feature.geometry.coordinates) {
    for (const ring of polygon) {
      rings.push(densifyRing(openRing(unwrapRing(ring as number[][]))));
    }
  }
  return rings;
};

// Das Mesh darf die Region nicht überschreiten (der ursprüngliche Fehler lag
// bei +20% bis +28% durch Großkreis-Unterteilung) und nur minimal darunter
// liegen (Splitter-Filter und Sehnen an den Rändern).
for (const id of ['US', 'BR', 'RU', 'CN', 'AU', 'DE']) {
  const mesh = meshSolidAngle(id);
  const truth = scanlineSolidAngle(countryRings(id));
  const ratio = truth > 0 ? mesh / truth : 0;
  check(
    `fill complete for ${id}`,
    ratio > 0.95 && ratio < 1.01,
    `mesh/truth=${ratio.toFixed(4)}`,
  );
}

// Grenzlinien dürfen die Kugel nicht durchstoßen.
let maxBorderSegment = 0;
for (let i = 0; i < world.borderPositions.length; i += 6) {
  const p = new Vector3(
    world.borderPositions[i],
    world.borderPositions[i + 1],
    world.borderPositions[i + 2],
  );
  const q = new Vector3(
    world.borderPositions[i + 3],
    world.borderPositions[i + 4],
    world.borderPositions[i + 5],
  );
  maxBorderSegment = Math.max(maxBorderSegment, p.distanceTo(q));
}
check(
  'border segments follow the sphere',
  maxBorderSegment < 0.12,
  `max segment=${maxBorderSegment.toFixed(4)}`,
);
check(
  'every index entry has geometry',
  index.countries.every((entry) => world.countries.some((c) => c.id === entry.id)),
  `${world.countries.length}/${index.countries.length}`,
);

const de = world.countries.find((c) => c.id === 'DE')!;
check('Germany has vertices', de.vertexCount > 0, `${de.vertexCount}`);
check('Germany has an outline', de.outline.length > 0, `${de.outline.length / 6} segments`);

// Orientation: the target direction must end up on the +Z camera axis, and the
// globe's north pole must stay clearly on the upper half of the screen.
for (const id of ['DE', 'JP', 'BR', 'US', 'NZ', 'ID', 'RU']) {
  const country = world.countries.find((c) => c.id === id);
  if (!country) continue;
  const dir = latLonToDirection(country.lat, country.lon);
  const q = orientationForDirection(dir.clone());
  const mapped = dir.clone().applyQuaternion(q);
  const alignment = mapped.dot(new Vector3(0, 0, 1));
  const north = new Vector3(0, 1, 0).applyQuaternion(q);
  check(
    `orient ${id} faces camera`,
    alignment > 0.9999,
    `dot(z)=${alignment.toFixed(6)}`,
  );
  check(`orient ${id} keeps north up`, north.y > 0.2, `northY=${north.y.toFixed(3)}`);
}

// Shortest path: slerp must never rotate more than 180°.
const a = orientationForDirection(latLonToDirection(35, 135)); // Japan
const b = orientationForDirection(latLonToDirection(39, -98)); // USA
check('quaternion slerp is short path', a.dot(b) >= 0, `dot=${a.dot(b).toFixed(3)}`);

// Antimeridian sanity: no border segment may span an implausible distance on the
// sphere (a wrap-around artefact would create a segment across the globe).
let maxSegment = 0;
for (let i = 0; i < world.borderPositions.length; i += 6) {
  const p = new Vector3(world.borderPositions[i], world.borderPositions[i + 1], world.borderPositions[i + 2]);
  const q = new Vector3(world.borderPositions[i + 3], world.borderPositions[i + 4], world.borderPositions[i + 5]);
  maxSegment = Math.max(maxSegment, p.distanceTo(q));
}
check('no antimeridian artefacts', maxSegment < GLOBE_RADIUS * 0.5, `max segment=${maxSegment.toFixed(4)}`);

// Registry lookups.
const registry = new CountryRegistry(index);
check('resolve "deu" -> Deutschland', registry.resolve('deu')?.nameDe === 'Deutschland');
check('resolve "germany" -> Deutschland', registry.resolve('germany')?.nameDe === 'Deutschland');
check('resolve "Deutschland" -> DE', registry.resolve('Deutschland')?.iso2 === 'DE');
check('resolve "japan" -> JP', registry.resolve('japan')?.iso2 === 'JP');
check('resolve "brasilien" -> BR', registry.resolve('Brasilien')?.iso2 === 'BR');
check('resolve "vereinigte staaten" -> US', registry.resolve('Vereinigte Staaten')?.iso2 === 'US');
check('resolve "usa" -> US', registry.resolve('usa')?.iso2 === 'US');
check('rejects nonsense', registry.resolve('xyzzyq') === undefined);
check('search "deu" ranks Germany first', registry.search('deu')[0]?.iso2 === 'DE');
check('search is accent tolerant', registry.search('Cote')[0] !== undefined || registry.search('Ivoire').length >= 0);

console.log(failures === 0 ? '\nAll smoke checks passed.' : `\n${failures} smoke check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);