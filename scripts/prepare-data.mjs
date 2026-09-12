/**
 * Data preparation for the Globe Film Tool.
 *
 * Downloads Natural Earth 1:110m Admin 0 Countries, reduces it to the few
 * attributes the renderer actually needs, computes a robust spherical centroid
 * and angular radius per country, and copies the required SVG flags.
 *
 * The result is fully self contained: after this script ran once the app has no
 * runtime dependency on any external API.
 *
 * Usage:  npm run data
 */
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile, copyFile, access } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const SOURCE_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';
const CACHE = join(root, '.cache', 'ne_110m_admin_0_countries.geojson');
const OUT_DATA = join(root, 'public', 'data');
const OUT_FLAGS = join(root, 'public', 'flags');
const FLAG_SRC = join(root, 'node_modules', 'flag-icons', 'flags', '4x3');

const DEG = Math.PI / 180;

const exists = (p) =>
  access(p).then(
    () => true,
    () => false,
  );

async function download(url, dest) {
  if (await exists(dest)) {
    console.log(`• cached  ${dest.replace(root + '/', '')}`);
    return;
  }
  await mkdir(dirname(dest), { recursive: true });
  console.log(`↓ fetch   ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  await pipeline(res.body, createWriteStream(dest));
}

/** lon/lat (degrees) -> unit sphere vector, aligned with three.js SphereGeometry UVs. */
function toVector(lon, lat) {
  const phi = (lon + 180) * DEG;
  const polar = (90 - lat) * DEG;
  const s = Math.sin(polar);
  return { x: -s * Math.cos(phi), y: Math.cos(polar), z: s * Math.sin(phi) };
}

function vectorToLatLon(v) {
  const lat = 90 - Math.acos(Math.max(-1, Math.min(1, v.y))) / DEG;
  const lon = Math.atan2(v.z, -v.x) / DEG - 180;
  return { lat, lon: ((lon + 540) % 360) - 180 };
}

/**
 * Spherical centroid ("area vector") of every polygon of a country.
 * Works across the antimeridian without any special casing because it operates
 * on 3D vectors instead of raw longitude values.
 */
function computeCentroid(polygons) {
  // Determine the dominant landmass first. Countries such as France or the USA
  // include far away overseas territories; framing and labelling must target the
  // main landmass instead of the geographic average of every island.
  let best = null;
  let total = 0;
  for (const rings of polygons) {
    const outer = rings[0];
    if (!outer || outer.length < 3) continue;
    const a = { x: 0, y: 0, z: 0 };
    const m = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < outer.length - 1; i++) {
      const p = toVector(outer[i][0], outer[i][1]);
      const q = toVector(outer[i + 1][0], outer[i + 1][1]);
      a.x += p.y * q.z - p.z * q.y;
      a.y += p.z * q.x - p.x * q.z;
      a.z += p.x * q.y - p.y * q.x;
      m.x += p.x;
      m.y += p.y;
      m.z += p.z;
    }
    // Natural Earth rings are not guaranteed to be counter-clockwise, so the
    // raw area vector may point inward. Flip it against the mean vertex
    // direction to always obtain an outward pointing contribution.
    if (a.x * m.x + a.y * m.y + a.z * m.z < 0) {
      a.x = -a.x;
      a.y = -a.y;
      a.z = -a.z;
    }
    const size = Math.hypot(a.x, a.y, a.z);
    total += size;
    if (!best || size > best.size) best = { a, size, outer };
  }

  if (!best) return { lat: 0, lon: 0, angularRadius: 0, solidAngle: 0 };

  const len = best.size;
  const dir = { x: best.a.x / len, y: best.a.y / len, z: best.a.z / len };

  let maxAngle = 0;
  for (const [lon, lat] of best.outer) {
    const v = toVector(lon, lat);
    const dot = Math.max(-1, Math.min(1, v.x * dir.x + v.y * dir.y + v.z * dir.z));
    const angle = Math.acos(dot);
    if (angle > maxAngle) maxAngle = angle;
  }

  return { ...vectorToLatLon(dir), angularRadius: maxAngle, solidAngle: total };
}

const round = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

function validIso2(value) {
  const v = String(value ?? '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(v) && v !== '-99' ? v : null;
}

// Natural Earth leaves ISO_A3 as "-99" for a few disputed/partially recognised
// territories. Provide explicit alpha-3 codes so the search index stays complete.
const ISO3_FALLBACK = {
  FR: 'FRA',
  NO: 'NOR',
  XK: 'XKX',
  CN: 'CHN',
  TW: 'TWN',
};

function slug(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[^A-Za-z]+/g, '-')
    .replace(/^-|-$/g, '')
    .toUpperCase();
}

async function main() {
  await download(SOURCE_URL, CACHE);
  const raw = JSON.parse(await readFile(CACHE, 'utf8'));
  await mkdir(OUT_DATA, { recursive: true });
  await mkdir(OUT_FLAGS, { recursive: true });

  const features = [];
  const index = [];

  for (const feature of raw.features) {
    const p = feature.properties ?? {};
    const geom = feature.geometry;
    if (!geom) continue;

    const iso2 = validIso2(p.ISO_A2) ?? validIso2(p.ISO_A2_EH);
    const rawIso3 = String(p.ISO_A3 ?? '').toUpperCase();
    const iso3 =
      /^[A-Z]{3}$/.test(rawIso3) && rawIso3 !== '-99'
        ? rawIso3
        : (iso2 && ISO3_FALLBACK[iso2]) || null;
    const name = (p.NAME_EN || p.NAME || p.ADMIN || '').trim();
    if (!name) continue;
    const nameDe = (p.NAME_DE || p.NAME_EN || name).trim();

    const id = iso2 ?? iso3 ?? slug(name);
    const polygons = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];

    // Trim numeric precision: 3 decimals is ~110 m at the equator, far below
    // what the stylised globe can show, and keeps the payload small.
    const cleanPolys = polygons
      .map((rings) =>
        rings.map((ring) => ring.filter((_, i) => i % 1 === 0).map(([lon, lat]) => [round(lon, 3), round(lat, 3)])),
      )
      .filter((rings) => (rings[0]?.length ?? 0) >= 4);

    if (!cleanPolys.length) continue;

    const { lat, lon, angularRadius, solidAngle } = computeCentroid(cleanPolys);

    let flag = null;
    if (iso2 && (await exists(join(FLAG_SRC, `${iso2.toLowerCase()}.svg`)))) {
      flag = `flags/${iso2.toLowerCase()}.svg`;
      await copyFile(join(FLAG_SRC, `${iso2.toLowerCase()}.svg`), join(OUT_FLAGS, `${iso2.toLowerCase()}.svg`));
    }

    features.push({
      type: 'Feature',
      properties: { id, iso2, iso3, name, nameDe },
      geometry: { type: 'MultiPolygon', coordinates: cleanPolys },
    });

    index.push({
      id,
      iso2,
      iso3,
      name,
      nameDe,
      continent: p.CONTINENT ?? '',
      lat: round(lat, 2),
      lon: round(lon, 2),
      angularRadius: round(angularRadius, 4),
      solidAngle: round(solidAngle, 5),
      flag,
    });
  }

  index.sort((a, b) => a.nameDe.localeCompare(b.nameDe, 'de'));

  await writeFile(
    join(OUT_DATA, 'countries.geojson'),
    JSON.stringify({ type: 'FeatureCollection', features }),
  );
  await writeFile(
    join(OUT_DATA, 'country-index.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), countries: index }, null, 0),
  );

  const withFlag = index.filter((c) => c.flag).length;
  console.log(
    `✓ wrote ${features.length} countries (${withFlag} with flag) -> public/data/ and public/flags/`,
  );
}

main().catch((err) => {
  console.error('Data preparation failed:', err);
  process.exit(1);
});