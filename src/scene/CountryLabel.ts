import {
  CanvasTexture,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { COLORS, LABEL_RADIUS } from '../config';
import type { CountryIndexEntry } from '../data/types';
import { latLonToDirection } from '../geography/geoProjection';
import { labelAnchor } from '../geography/orientation';

const CANVAS_W = 1024;
const CANVAS_H = 416;
const CARD_ASPECT = CANVAS_W / CANVAS_H;

const PLANE_FACING = new Vector3(0, 0, 1);

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
 * A single card that carries the flag and the country name. It is positioned on
 * the globe surface at the country's centre (nudged north) and keeps the globe's
 * rotation, so it never behaves like a flat HUD overlay.
 */
export class CountryLabel {
  readonly mesh: Mesh;
  private readonly texture: CanvasTexture;
  private readonly material: MeshBasicMaterial;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly flags = new FlagCache();
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

  get visibleEntry(): CountryIndexEntry | null {
    return this.entry;
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

  /** Places and renders the card for a country. Safe against rapid switching. */
  async show(entry: CountryIndexEntry): Promise<void> {
    this.entry = entry;
    const token = ++this.requestId;

    const direction = latLonToDirection(entry.lat, entry.lon);
    const anchor = labelAnchor(direction, entry.angularRadius);
    const lift = Math.max(0.02, Math.min(0.5, entry.angularRadius * 0.5));
    this.mesh.position.copy(anchor).multiplyScalar(LABEL_RADIUS + lift);
    this.mesh.quaternion.copy(new Quaternion().setFromUnitVectors(PLANE_FACING, anchor));

    const width = Math.max(0.78, Math.min(1.9, 0.62 + entry.angularRadius * 1.9));
    this.mesh.scale.set(width, width / CARD_ASPECT, 1);

    const flag = entry.flag ? await this.flags.get(this.resolveAsset(entry.flag)) : null;
    if (token !== this.requestId) return;
    this.draw(entry, flag);
    this.mesh.visible = this.material.opacity > 0.002;
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