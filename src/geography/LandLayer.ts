import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  type Material,
} from 'three';
import { COLORS } from '../config';
import type { Country } from '../data/types';
import { baseColorFor, type BuiltWorld } from './GeographyEngine';

/** BufferAttribute gained partial-update support in three r159. */
type UpdatableAttribute = BufferAttribute & {
  clearUpdateRanges?: () => void;
  addUpdateRange?: (start: number, count: number) => void;
};

/** The parameter object three hands to `onBeforeCompile`. */
type OnBeforeCompileShader = Parameters<NonNullable<Material['onBeforeCompile']>>[0];

/** Marker byte for "belongs to the highlighted country" / "does not". */
const MARKER_ON = 255;
const MARKER_OFF = 0;

/**
 * Owns the merged land mesh, the merged border lines and the single active
 * highlight.
 *
 * The land tint is baked once into a vertex-colour attribute. The accent is a
 * shader mix driven by two uniforms plus a per-vertex marker byte, so an
 * animated highlight costs one uniform write per frame instead of a
 * multi-megabyte vertex-colour re-upload. Switching country rewrites only the
 * two affected marker ranges and the small outline buffers.
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

  /** One byte per vertex: 255 for the active country, 0 otherwise. */
  private readonly markers: Uint8Array;
  private readonly markerAttribute: UpdatableAttribute;
  private readonly countriesById = new Map<string, Country>();
  private readonly baseScratch: [number, number, number] = [0, 0, 0];

  /**
   * Created up front and handed to the compiled shader, so they can be updated
   * even before the first render triggers compilation.
   */
  private readonly highlightColorUniform = { value: new Color(COLORS.highlight) };
  private readonly highlightAmountUniform = { value: 0 };

  private active: Country | null = null;
  private intensity = 0;

  constructor(world: BuiltWorld) {
    const { countries, landPositions, landNormals, landIndices, borderPositions } = world;

    // Base colours are uniform per country and never change after construction.
    // Computed on demand per country instead of stored per vertex.
    const colors = new Float32Array(landPositions.length);
    for (const country of countries) {
      this.countriesById.set(country.id, country);
      baseColorFor(country, this.baseScratch);
      const end = country.vertexStart + country.vertexCount;
      for (let i = country.vertexStart; i < end; i++) {
        colors[i * 3] = this.baseScratch[0];
        colors[i * 3 + 1] = this.baseScratch[1];
        colors[i * 3 + 2] = this.baseScratch[2];
      }
    }

    this.markers = new Uint8Array(landPositions.length / 3);

    this.landGeometry = new BufferGeometry();
    this.landGeometry.setAttribute('position', new BufferAttribute(landPositions, 3));
    this.landGeometry.setAttribute('normal', new BufferAttribute(landNormals, 3));
    this.landGeometry.setAttribute('color', new BufferAttribute(colors, 3));
    // Normalised Uint8: the shader reads it as a float in [0, 1].
    this.markerAttribute = new BufferAttribute(this.markers, 1, true) as UpdatableAttribute;
    this.landGeometry.setAttribute('aHighlight', this.markerAttribute);
    this.landGeometry.setIndex(new BufferAttribute(landIndices, 1));
    this.landGeometry.computeBoundingSphere();

    this.landMaterial = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.72,
      metalness: 0.05,
      emissive: new Color(0x0a1c26),
      emissiveIntensity: 0.55,
    });
    this.landMaterial.onBeforeCompile = (shader) => this.patchLandShader(shader);
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

  /**
   * Injects the accent mix into the standard material.
   *
   * Fallback, should this ever break against a three.js update: drop the
   * injection and instead render a second mesh that shares the position and
   * normal attributes but uses only the active country's index slice, with its
   * own unlit transparent material. That costs one extra draw call and an index
   * rebuild per switch, but stays visually equivalent.
   *
   * At the point of `color_fragment` the diffuse colour already carries the
   * per-vertex country tint (the material colour itself is white), so mixing
   * here is exactly equivalent to the previous vertex-colour rewrite – but the
   * per-frame cost drops from a buffer upload to a single uniform.
   */
  private patchLandShader(shader: OnBeforeCompileShader): void {
    shader.uniforms.uHighlightColor = this.highlightColorUniform;
    shader.uniforms.uHighlightAmount = this.highlightAmountUniform;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aHighlight;\nvarying float vHighlight;',
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHighlight = aHighlight;');

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec3 uHighlightColor;\nuniform float uHighlightAmount;\nvarying float vHighlight;',
      )
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uHighlightColor, vHighlight * uHighlightAmount);',
      );
  }

  setBordersVisible(visible: boolean): void {
    this.borders.visible = visible;
  }

  /** Selects the country that receives the accent colouring. */
  setActive(country: Country | null): void {
    if (this.active === country) return;
    // Both the old and the new country may change in this batch, so the update
    // ranges are cleared once and then accumulated.
    this.markerAttribute.clearUpdateRanges?.();
    if (this.active) this.writeMarker(this.active, MARKER_OFF);
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
      this.writeMarker(country, MARKER_ON);
    }
    this.markerAttribute.needsUpdate = true;
    line.computeBoundingSphere();
    glow.computeBoundingSphere();
  }

  /** 0 = plain land, 1 = full accent. One uniform write, no buffer traffic. */
  setIntensity(value: number): void {
    const clamped = value < 0 ? 0 : value > 1 ? 1 : value;
    if (Math.abs(clamped - this.intensity) < 0.0005) return;
    this.intensity = clamped;
    this.highlightAmountUniform.value = clamped;
    this.highlightMaterial.opacity = clamped;
    this.highlightGlowMaterial.opacity = clamped * 0.35;
  }

  getIntensity(): number {
    return this.intensity;
  }

  getCountry(id: string): Country | undefined {
    return this.countriesById.get(id);
  }

  /** Marks a country's vertex range and schedules exactly that range for upload. */
  private writeMarker(country: Country, value: number): void {
    const start = country.vertexStart;
    const end = start + country.vertexCount;
    this.markers.fill(value, start, end);
    // itemSize 1, so the update range is expressed in bytes 1:1.
    this.markerAttribute.addUpdateRange?.(start, country.vertexCount);
  }

  dispose(): void {
    this.landGeometry.dispose();
    this.landMaterial.dispose();
    this.borderMaterial.dispose();
    this.highlightMaterial.dispose();
    this.highlightGlowMaterial.dispose();
    this.highlightLine.geometry.dispose();
    this.highlightGlow.geometry.dispose();
  }
}
