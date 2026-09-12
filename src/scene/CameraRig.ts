import { PerspectiveCamera } from 'three';
import type { CameraProfile } from '../config';

/**
 * Thin abstraction around the single virtual camera. The camera always orbits
 * the origin on the +Z axis; the globe is rotated into view instead. That keeps
 * orientation logic in one place and avoids scattered Euler chains.
 */
export class CameraRig {
  readonly camera: PerspectiveCamera;
  private profile: CameraProfile;
  private aspectValue = 1;
  distance: number;

  constructor(profile: CameraProfile) {
    this.profile = profile;
    this.distance = profile.idleDistance;
    // A slightly larger near plane keeps depth precision high enough that the
    // land shell never z-fights with the ocean sphere.
    this.camera = new PerspectiveCamera(profile.fov, 1, 0.1, 2000);
    this.apply();
  }

  setProfile(profile: CameraProfile): void {
    this.profile = profile;
    this.camera.fov = profile.fov;
    this.camera.updateProjectionMatrix();
  }

  getProfile(): CameraProfile {
    return this.profile;
  }

  setAspect(aspect: number): void {
    this.aspectValue = aspect;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  getAspect(): number {
    return this.aspectValue;
  }

  apply(): void {
    const offsetY = this.profile.centerOffsetY * this.distance;
    this.camera.position.set(0, offsetY, this.distance);
    this.camera.lookAt(0, 0, 0);
  }
}