import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import {
  CAMERA_PROFILES,
  COLORS,
  FORMATS,
  GLOBE_RADIUS,
  MAX_PIXEL_RATIO,
  type FormatKey,
} from '../config';
import type { CountryIndexEntry } from '../data/types';
import { LandLayer } from '../geography/LandLayer';
import type { BuiltWorld } from '../geography/GeographyEngine';
import { createAtmosphere } from './Atmosphere';
import { CameraRig } from './CameraRig';
import { CountryLabel } from './CountryLabel';
import { createStarfield } from './Starfield';

export interface RenderStats {
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
}

/**
 * Owns the three.js scene: renderer, camera rig, globe group, star field and
 * all visual layers. It knows nothing about the UI or the animation order.
 */
export class GlobeScene {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly rig: CameraRig;
  readonly globe: Group;
  readonly land: LandLayer;
  readonly label: CountryLabel;

  private readonly starfield: ReturnType<typeof createStarfield>;
  private readonly ocean: Mesh;
  private format: FormatKey = 'landscape';

  constructor(canvas: HTMLCanvasElement, world: BuiltWorld, format: FormatKey) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(COLORS.space, 1);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.scene = new Scene();
    this.scene.background = new Color(COLORS.space);

    this.format = format;
    this.rig = new CameraRig(CAMERA_PROFILES[format]);

    this.starfield = createStarfield();
    this.scene.add(this.starfield.backdrop);
    for (const stars of this.starfield.stars) this.scene.add(stars);

    const hemi = new HemisphereLight(0x9fc6ff, 0x061020, 0.85);
    this.scene.add(hemi);

    const key = new DirectionalLight(0xffffff, 1.35);
    key.position.set(3.4, 4.2, 6.5);
    this.scene.add(key);

    const fill = new DirectionalLight(COLORS.atmosphere, 0.45);
    fill.position.set(-5, -2.5, -4);
    this.scene.add(fill);

    const ambient = new AmbientLight(0x21384f, 0.6);
    this.scene.add(ambient);

    this.globe = new Group();
    this.scene.add(this.globe);

    this.ocean = new Mesh(
      new SphereGeometry(GLOBE_RADIUS, 96, 64),
      new MeshStandardMaterial({
        color: COLORS.ocean,
        emissive: new Color(COLORS.oceanDeep),
        emissiveIntensity: 0.9,
        roughness: 0.86,
        metalness: 0.18,
      }),
    );
    this.ocean.renderOrder = 1;
    this.globe.add(this.ocean);

    this.land = new LandLayer(world);
    this.globe.add(this.land.mesh, this.land.borders, this.land.highlightGlow, this.land.highlightLine);

    // The label hangs off the scene, not the globe: it is drawn parallel to the
    // image plane, so it must not inherit the globe's rotation.
    this.label = new CountryLabel(this.renderer.capabilities.getMaxAnisotropy());
    this.scene.add(this.label.mesh);

    this.globe.add(createAtmosphere());
  }

  setFormat(format: FormatKey): void {
    this.format = format;
    this.rig.setProfile(CAMERA_PROFILES[format]);
  }

  getFormat(): FormatKey {
    return this.format;
  }

  /** Distance that frames the given country comfortably for the current format. */
  computeZoomDistance(entry: CountryIndexEntry): number {
    const profile = this.rig.getProfile();
    const halfV = (profile.fov * Math.PI) / 360;
    const aspect = this.rig.getAspect() || 1;
    const halfH = Math.atan(Math.tan(halfV) * aspect);
    const halfMin = Math.max(0.05, Math.min(halfV, halfH));
    const halfExtent = GLOBE_RADIUS * Math.sin(Math.min(entry.angularRadius, Math.PI / 2 - 0.01));
    const distance = GLOBE_RADIUS + (halfExtent * profile.fitSafety) / Math.tan(halfMin);
    return Math.max(profile.minDistance, Math.min(profile.maxDistance, distance));
  }

  /** Resizes to a CSS pixel size; the canvas itself is styled to fill its box. */
  resize(width: number, height: number): void {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.rig.setAspect(width / Math.max(1, height));
  }

  render(): void {
    this.rig.apply();
    // The label projects the country centre through the camera, so the camera's
    // world matrix has to be current before it runs.
    this.rig.camera.updateMatrixWorld();
    this.label.update(this.rig.camera, this.globe.quaternion, this.rig.getAspect(), this.format);
    this.renderer.render(this.scene, this.rig.camera);
  }

  getStats(): RenderStats {
    const info = this.renderer.info;
    return {
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
    };
  }

  /** Reference frame size of the selected format (for the export profile label). */
  getFormatSize(): { width: number; height: number } {
    return FORMATS[this.format];
  }

  dispose(): void {
    this.land.dispose();
    this.label.dispose();
    this.starfield.dispose();
    this.ocean.geometry.dispose();
    (this.ocean.material as MeshStandardMaterial).dispose();
    this.renderer.dispose();
  }
}