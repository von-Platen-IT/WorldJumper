import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  SRGBColorSpace,
  SphereGeometry,
} from 'three';
import { COLORS, starCount } from '../config';

function makeStarSprite(softness: number): CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.25, `rgba(255,255,255,${0.6 * softness})`);
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function makeNebulaTexture(): CanvasTexture {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#03050d';
  ctx.fillRect(0, 0, width, height);

  const blobs: [number, number, number, string][] = [
    [0.18, 0.28, 0.42, 'rgba(48,86,168,0.32)'],
    [0.72, 0.66, 0.38, 'rgba(96,60,150,0.24)'],
    [0.52, 0.2, 0.3, 'rgba(30,120,150,0.2)'],
    [0.86, 0.3, 0.26, 'rgba(140,80,120,0.18)'],
    [0.34, 0.78, 0.3, 'rgba(40,70,140,0.22)'],
  ];
  for (const [x, y, r, color] of blobs) {
    const gradient = ctx.createRadialGradient(x * width, y * height, 0, x * width, y * height, r * width);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function buildStarPoints(count: number, radiusMin: number, radiusMax: number, size: number, softness: number) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const tint = new Color();

  for (let i = 0; i < count; i++) {
    const u = Math.random() * 2 - 1;
    const theta = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const radius = radiusMin + Math.random() * (radiusMax - radiusMin);
    positions[i * 3] = Math.cos(theta) * r * radius;
    positions[i * 3 + 1] = u * radius;
    positions[i * 3 + 2] = Math.sin(theta) * r * radius;

    const roll = Math.random();
    if (roll < 0.6) tint.setHex(0xffffff);
    else if (roll < 0.8) tint.setHex(0xbcd4ff);
    else if (roll < 0.93) tint.setHex(0xffe6c0);
    else tint.setHex(0xff9c8a);
    colors[i * 3] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  const sprite = makeStarSprite(softness);
  const material = new PointsMaterial({
    size,
    map: sprite,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    sizeAttenuation: true,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  return { points, dispose: () => { geometry.dispose(); material.dispose(); sprite.dispose(); } };
}

/**
 * Static star field plus a soft nebula backdrop. Two point clouds keep the
 * bright stars distinguishable without any per-frame work.
 */
export function createStarfield(): { stars: Points[]; backdrop: Mesh; dispose: () => void } {
  const faint = buildStarPoints(starCount, 70, 160, 1.35, 0.5);
  const bright = buildStarPoints(Math.round(starCount * 0.05), 60, 130, 2.7, 0.85);

  const backdropGeometry = new SphereGeometry(400, 32, 24);
  const backdropMaterial = new MeshBasicMaterial({
    map: makeNebulaTexture(),
    side: BackSide,
    depthWrite: false,
    color: new Color(COLORS.nebula),
    opacity: 0.9,
    transparent: true,
  });
  const backdrop = new Mesh(backdropGeometry, backdropMaterial);
  backdrop.frustumCulled = false;

  return {
    stars: [faint.points, bright.points],
    backdrop,
    dispose: () => {
      faint.dispose();
      bright.dispose();
      backdropGeometry.dispose();
      backdropMaterial.map?.dispose();
      backdropMaterial.dispose();
    },
  };
}