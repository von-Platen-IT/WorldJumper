/**
 * Headless performance baseline for the rendering-critical paths that do not
 * need a browser: the one-off geometry build and the per-frame highlight update
 * that the animation drives while zooming.
 *
 * Bundled with esbuild and executed in Node – no browser or WebGL required.
 *
 * Usage: npm run bench
 */
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import type { CountryFeatureCollection, CountryIndexFile } from '../src/data/types';
import { buildWorld } from '../src/geography/GeographyEngine';
import { LandLayer } from '../src/geography/LandLayer';

const load = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

const features = load<CountryFeatureCollection>('public/data/countries.geojson');
const index = load<CountryIndexFile>('public/data/country-index.json');

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const BUILD_RUNS = 5;
const buildTimes: number[] = [];
let world = buildWorld(features, index);
for (let i = 0; i < BUILD_RUNS; i++) {
  const start = performance.now();
  world = buildWorld(features, index);
  buildTimes.push(performance.now() - start);
}

console.log('--- geometry ---');
console.log(`countries        ${world.countries.length}`);
console.log(`land vertices    ${world.landPositions.length / 3}`);
console.log(`land triangles   ${world.landIndices.length / 3}`);
console.log(`border segments  ${world.borderPositions.length / 6}`);
console.log(
  `buildWorld       median ${median(buildTimes).toFixed(1)} ms  ` +
    `(min ${Math.min(...buildTimes).toFixed(1)}, max ${Math.max(...buildTimes).toFixed(1)}, n=${BUILD_RUNS})`,
);

// The animation calls setIntensity once per frame during PREPARE and ZOOM.
// Simulate 120 frames on the largest and a small country to quantify the cost.
const layer = new LandLayer(world);

const measureFrames = (countryId: string): { ms: number; vertices: number } => {
  const country = world.countries.find((c) => c.id === countryId);
  if (!country) return { ms: 0, vertices: 0 };
  layer.setActive(country);
  const frames = 120;
  const start = performance.now();
  for (let i = 0; i < frames; i++) layer.setIntensity(i / frames);
  return { ms: (performance.now() - start) / frames, vertices: country.vertexCount };
};

console.log('--- highlight update per frame (setIntensity) ---');
for (const id of ['RU', 'US', 'DE', 'JP']) {
  const { ms, vertices } = measureFrames(id);
  console.log(`${id}  ${ms.toFixed(3)} ms/frame  (${vertices} vertices)`);
}

// Switching the active country rebuilds the highlight outline buffers.
const switchStart = performance.now();
for (let i = 0; i < 50; i++) {
  const country = world.countries[i % world.countries.length];
  layer.setActive(country);
}
console.log('--- country switch (setActive) ---');
console.log(`50 switches      ${((performance.now() - switchStart) / 50).toFixed(3)} ms/switch`);
