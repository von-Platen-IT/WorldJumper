import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import { COLORS } from '../config';
import type { Country } from '../data/types';
import { baseColorFor, type BuiltWorld } from './GeographyEngine';

const HIGHLIGHT = new Color(COLORS.highlight);

/** BufferAttribute gained partial-update support in three r159. */
type UpdatableAttribute = BufferAttribute & {
  clearUpdateRanges?: () => void;
  addUpdateRange?: (start: number, count: number) => void;
};

/**
 * Owns the merged land mesh, the merged border lines and the single active
 * highlight. Geometry is built once; during a transition only the highlighted
 * country's vertex colours change.
 */
export class LandLayer {
  readonly mesh: Mesh;
  readonly borders: LineSegments;
  readonly highlightLine: LineSegments;
  readonly highlightGlow: LineSegments;

  private readonly landGeometry: BufferGeometry;
  private readonly landMaterial: MeshStandardMaterial;
  private readonly borderMaterial: LineBasicMaterial;
  private readonly highlightMaterial: LineBasicMaterial;
  private readonly highlightGlowMaterial: LineBasicMaterial;

  private readonly colorAttribute: UpdatableAttribute;
  private readonly colors: Float32Array;
  private readonly countriesById = new Map<string, Country>();
  private readonly baseScratch: [number, number, number] = [0, 0, 0];

  private active: Country | null = null;
  private intensity = 0;

  constructor(world: BuiltWorld) {
    const { countries, landPositions, landNormals, landIndices, borderPositions } = world;

    // Base colours are uniform per country, so they are computed on demand
    // rather than stored per vertex – this halves the colour memory (~13 MB).
    this.colors = new Float32Array(landPositions.length);
    for (const country of countries) {
      this.countriesById.set(country.id, country);
      baseColorFor(country, this.baseScratch);
      for (let i = country.vertexStart; i < country.vertexStart + country.vertexCount; i++) {
        this.colors[i * 3] = this.baseScratch[0];
        this.colors[i * 3 + 1] = this.baseScratch[1];
        this.colors[i * 3 + 2] = this.baseScratch[2];
      }
    }

    this.landGeometry = new BufferGeometry();
    this.landGeometry.setAttribute('position', new BufferAttribute(landPositions, 3));
    this.landGeometry.setAttribute('normal', new BufferAttribute(landNormals, 3));
    this.colorAttribute = new BufferAttribute(this.colors, 3) as UpdatableAttribute;
    this.landGeometry.setAttribute('color', this.colorAttribute);
    this.landGeometry.setIndex(new BufferAttribute(landIndices, 1));
    this.landGeometry.computeBoundingSphere();

    this.landMaterial = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.72,
      metalness: 0.05,
      emissive: new Color(0x0a1c26),
      emissiveIntensity: 0.55,
    });
    this.mesh = new Mesh(this.landGeometry, this.landMaterial);
    this.mesh.renderOrder = 2;

    const borderGeometry = new BufferGeometry();
    borderGeometry.setAttribute('position', new BufferAttribute(borderPositions, 3));
    this.borderMaterial = new LineBasicMaterial({
      color: COLORS.border,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    this.borders = new LineSegments(borderGeometry, this.borderMaterial);
    this.borders.renderOrder = 3;

    this.highlightMaterial = new LineBasicMaterial({
      color: COLORS.highlightBorder,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.highlightLine = new LineSegments(new BufferGeometry(), this.highlightMaterial);
    this.highlightLine.renderOrder = 5;
    this.highlightLine.frustumCulled = false;

    this.highlightGlowMaterial = new LineBasicMaterial({
      color: COLORS.highlight,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.highlightGlow = new LineSegments(new BufferGeometry(), this.highlightGlowMaterial);
    this.highlightGlow.renderOrder = 4;
    this.highlightGlow.frustumCulled = false;
  }

  setBordersVisible(visible: boolean): void {
    this.borders.visible = visible;
  }

  /** Selects the country that receives the accent colouring. */
  setActive(country: Country | null): void {
    if (this.active === country) return;
    // Both the old and the new country may change in this batch, so the update
    // ranges are cleared once and then accumulated.
    this.colorAttribute.clearUpdateRanges?.();
    if (this.active) this.writeCountry(this.active, 0);
    this.active = country;

    const line = this.highlightLine.geometry;
    const glow = this.highlightGlow.geometry;
    if (!country) {
      line.setAttribute('position', new BufferAttribute(new Float32Array(0), 3));
      glow.setAttribute('position', new BufferAttribute(new Float32Array(0), 3));
    } else {
      line.setAttribute('position', new BufferAttribute(country.outline, 3));
      // A marginally scaled copy fakes a soft halo around the emphasised border.
      const scale = 1.004;
      const glowPositions = new Float32Array(country.outline.length);
      for (let i = 0; i < country.outline.length; i++) glowPositions[i] = country.outline[i] * scale;
      glow.setAttribute('position', new BufferAttribute(glowPositions, 3));
      this.writeCountry(country, this.intensity);
    }
    line.computeBoundingSphere();
    glow.computeBoundingSphere();
  }

  /** 0 = plain land, 1 = full accent. */
  setIntensity(value: number): void {
    const clamped = value < 0 ? 0 : value > 1 ? 1 : value;
    if (Math.abs(clamped - this.intensity) < 0.001) return;
    this.intensity = clamped;
    this.colorAttribute.clearUpdateRanges?.();
    this.writeCountry(this.active, clamped);
    this.highlightMaterial.opacity = clamped;
    this.highlightGlowMaterial.opacity = clamped * 0.35;
  }

  getIntensity(): number {
    return this.intensity;
  }

  getCountry(id: string): Country | undefined {
    return this.countriesById.get(id);
  }

  private writeCountry(country: Country | null, amount: number): void {
    if (!country) return;
    baseColorFor(country, this.baseScratch);
    const r = this.baseScratch[0];
    const g = this.baseScratch[1];
    const b = this.baseScratch[2];
    const end = country.vertexStart + country.vertexCount;

    for (let i = country.vertexStart; i < end; i++) {
      this.colors[i * 3] = r + (HIGHLIGHT.r - r) * amount;
      this.colors[i * 3 + 1] = g + (HIGHLIGHT.g - g) * amount;
      this.colors[i * 3 + 2] = b + (HIGHLIGHT.b - b) * amount;
    }

    // Re-upload only this country's slice instead of the entire colour buffer.
    this.colorAttribute.addUpdateRange?.(country.vertexStart * 3, country.vertexCount * 3);
    this.colorAttribute.needsUpdate = true;
  }

  dispose(): void {
    this.landGeometry.dispose();
    this.landMaterial.dispose();
    this.borderMaterial.dispose();
    this.highlightMaterial.dispose();
    this.highlightGlowMaterial.dispose();
  }
}