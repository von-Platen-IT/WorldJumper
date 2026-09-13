import {
  CanvasTexture,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { COLORS, GLOBE_RADIUS, LABEL, type FormatKey } from '../config';
import type { CountryIndexEntry } from '../data/types';
import { latLonToDirection } from '../geography/geoProjection';
import { computeLabelLayout } from './labelLayout';

const CANVAS_W = LABEL.canvasWidth;
const CANVAS_H = LABEL.canvasHeight;

// Scratch objects: placement runs every frame while the card is visible.
const SCRATCH_DIRECTION = new Vector3();
const SCRATCH_SURFACE = new Vector3();
const SCRATCH_TO_POINT = new Vector3();
const SCRATCH_RIGHT = new Vector3();
const SCRATCH_UP = new Vector3();
const SCRATCH_BACK = new Vector3();
const SCRATCH_FORWARD = new Vector3();
const SCRATCH_PROJECTED = new Vector3();

/** Small, bounded cache so repeated sequences do not re-fetch flag SVGs. */
class FlagCache {
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly order: string[] = [];
  constructor(private readonly limit = 24) {}

  async get(url: string): Promise<HTMLImageElement | null> {
    const cached = this.images.get(url);
    if (cached) return cached;
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      let svg = await response.text();
      // flag-icons SVGs only carry a viewBox; canvas needs intrinsic dimensions.
      if (!/<svg[^>]*\swidth=/i.test(svg)) {
        svg = svg.replace(/<svg/i, '<svg width="640" height="480"');
      }
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const objectUrl = URL.createObjectURL(blob);
      const image = new Image();
      image.decoding = 'async';
      const loaded = await new Promise<boolean>((resolve) => {
        image.onload = () => resolve(true);
        image.onerror = () => resolve(false);
        image.src = objectUrl;
      });
      URL.revokeObjectURL(objectUrl);
      if (!loaded) return null;
      this.images.set(url, image);
      this.order.push(url);
      if (this.order.length > this.limit) {
        const oldest = this.order.shift()!;
        this.images.delete(oldest);
      }
      return image;
    } catch {
      return null;
    }
  }
}

/**
 * A single card that carries the flag and the country name.
 *
 * It stays anchored to the country's position on the globe, but is drawn
 * parallel to the image plane instead of tangent to the surface. That keeps the
 * text horizontal and lets the size be measured in fractions of the frame, so
 * small and large countries are equally readable and the card never leaves the
 * frame. Placement happens in `update()`, which runs every frame while the card
 * is visible because the camera distance and the clamped position both change
 * during a camera move.
 *
 * The mesh therefore belongs to the scene, not to the rotating globe group: as
 * a child of the globe it would inherit the globe's rotation and stand at an
 * angle.
 */
export class CountryLabel {
  readonly mesh: Mesh;
  private readonly texture: CanvasTexture;
  private readonly material: MeshBasicMaterial;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly flags = new FlagCache();
  /** Country direction in the globe's own frame, set by `show()`. */
  private readonly direction = new Vector3();
  private requestId = 0;
  private entry: CountryIndexEntry | null = null;

  constructor(anisotropy = 1) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = CANVAS_W;
    this.canvas.height = CANVAS_H;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = anisotropy;
    this.texture.minFilter = LinearFilter;
    this.texture.generateMipmaps = false;

    this.material = new MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: true,
    });
    this.mesh = new Mesh(new PlaneGeometry(1, 1), this.material);
    this.mesh.visible = false;
    this.mesh.renderOrder = 8;
  }

  hide(): void {
    this.entry = null;
    this.material.opacity = 0;
    this.mesh.visible = false;
  }

  setOpacity(value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    this.material.opacity = clamped;
    this.mesh.visible = clamped > 0.002 && this.entry !== null;
  }

  /** Warms the flag asset so `show()` can render without a visible delay. */
  async preload(entry: CountryIndexEntry): Promise<void> {
    if (entry.flag) await this.flags.get(this.resolveAsset(entry.flag));
  }

  /** Loads the card content for a country. Safe against rapid switching. */
  async show(entry: CountryIndexEntry): Promise<void> {
    this.entry = entry;
    const token = ++this.requestId;
    latLonToDirection(entry.lat, entry.lon, this.direction);

    const flag = entry.flag ? await this.flags.get(this.resolveAsset(entry.flag)) : null;
    if (token !== this.requestId) return;
    this.draw(entry, flag);
    this.mesh.visible = this.material.opacity > 0.002;
  }

  /**
   * Places and sizes the card for the current frame. Cheap enough to call every
   * frame; returns immediately while the card is hidden.
   *
   * The caller must ensure the camera's world matrix is up to date, because the
   * country centre is projected through it.
   */
  update(
    camera: PerspectiveCamera,
    globeQuaternion: Quaternion,
    aspect: number,
    format: FormatKey,
  ): void {
    if (!this.entry || !this.mesh.visible) return;

    // Country position on the globe surface, in world space.
    SCRATCH_DIRECTION.copy(this.direction).applyQuaternion(globeQuaternion);
    SCRATCH_SURFACE.copy(SCRATCH_DIRECTION).multiplyScalar(GLOBE_RADIUS * LABEL.radiusFactor);

    // Camera basis. Offsets are expressed in these axes, because the card lies
    // in the image plane.
    SCRATCH_RIGHT.setFromMatrixColumn(camera.matrixWorld, 0);
    SCRATCH_UP.setFromMatrixColumn(camera.matrixWorld, 1);
    SCRATCH_BACK.setFromMatrixColumn(camera.matrixWorld, 2);
    SCRATCH_FORWARD.copy(SCRATCH_BACK).negate();

    const depth = Math.max(
      1e-3,
      SCRATCH_TO_POINT.copy(SCRATCH_SURFACE).sub(camera.position).dot(SCRATCH_FORWARD),
    );
    const tanHalfFov = Math.tan((camera.fov * Math.PI) / 360);
    const visibleHeight = 2 * depth * tanHalfFov;

    SCRATCH_PROJECTED.copy(SCRATCH_SURFACE).project(camera);
    const layout = computeLabelLayout(
      visibleHeight,
      aspect,
      format,
      SCRATCH_PROJECTED.x,
      SCRATCH_PROJECTED.y,
    );

    // Normalised device coordinates -> world offset within the image plane.
    const halfHeight = depth * tanHalfFov;
    const halfWidth = halfHeight * aspect;

    this.mesh.position
      .copy(camera.position)
      .addScaledVector(SCRATCH_FORWARD, depth)
      .addScaledVector(SCRATCH_RIGHT, layout.ndcX * halfWidth)
      .addScaledVector(SCRATCH_UP, layout.ndcY * halfHeight);
    // Image-parallel. The camera never rolls, so copying its rotation is what
    // keeps the text horizontal.
    this.mesh.quaternion.copy(camera.quaternion);
    this.mesh.scale.set(layout.width, layout.height, 1);
  }

  dispose(): void {
    this.texture.dispose();
    this.material.dispose();
    this.mesh.geometry.dispose();
  }

  private resolveAsset(path: string): string {
    const base = import.meta.env.BASE_URL || '/';
    return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  }

  private draw(entry: CountryIndexEntry, flag: HTMLImageElement | null): void {
    const ctx = this.ctx;
    const { width: w, height: h } = this.canvas;
    ctx.clearRect(0, 0, w, h);

    const radius = 34;
    ctx.beginPath();
    ctx.roundRect(6, 6, w - 12, h - 12, radius);
    ctx.fillStyle = 'rgba(4,10,20,0.82)';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(242,181,68,0.85)';
    ctx.stroke();

    const accent = '#f2b544';
    let textX = 56;

    if (flag) {
      const boxX = 48;
      const boxY = 84;
      const boxW = 224;
      const boxH = 168;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, 14);
      ctx.clip();
      // Cover-fit the 4:3 flag inside the box.
      const scale = Math.max(boxW / flag.width, boxH / flag.height);
      const dw = flag.width * scale;
      const dh = flag.height * scale;
      ctx.drawImage(flag, boxX + (boxW - dw) / 2, boxY + (boxH - dh) / 2, dw, dh);
      ctx.restore();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, 14);
      ctx.stroke();
      textX = boxX + boxW + 44;
    }

    const maxTextWidth = w - textX - 48;
    let nameSize = 96;
    ctx.textBaseline = 'alphabetic';
    const name = entry.nameDe;
    do {
      ctx.font = `700 ${nameSize}px "Inter", "Segoe UI", system-ui, sans-serif`;
      if (ctx.measureText(name).width <= maxTextWidth) break;
      nameSize -= 4;
    } while (nameSize > 34);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(name, textX, flag ? 176 : 156);

    ctx.font = '600 40px "Inter", "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = accent;
    const subtitle = [entry.iso3, entry.continent].filter(Boolean).join('  ·  ');
    ctx.fillText(subtitle.toUpperCase(), textX, flag ? 236 : 226);

    // Accent underline that ties the card to the highlighted border colour.
    const nameWidth = Math.min(ctx.measureText(subtitle.toUpperCase()).width, maxTextWidth);
    ctx.fillStyle = accent;
    ctx.fillRect(textX, flag ? 268 : 258, nameWidth, 6);

    this.texture.needsUpdate = true;
  }

  /** Dev-only hook used by the HUD to show which country the card represents. */
  get accentColor(): string {
    return `#${COLORS.highlightBorder.toString(16).padStart(6, '0')}`;
  }
}
