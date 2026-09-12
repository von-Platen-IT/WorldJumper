import { Quaternion, Vector3 } from 'three';
import { latLonToDirection } from './geoProjection';

const AXIS_Y = new Vector3(0, 1, 0);
const AXIS_X = new Vector3(1, 0, 0);
const Z_AXIS = new Vector3(0, 0, 1);

/**
 * Rotation that brings a surface direction onto the camera axis (+Z) while
 * keeping the globe's north pole roughly up on screen.
 *
 * Derivation: a yaw around Y maps the direction into the YZ plane, then a pitch
 * around X lifts it onto +Z. Because the target is expressed as an absolute
 * quaternion, `Quaternion.slerp` between the current and the target orientation
 * automatically follows the shortest rotational path – no 300° spins.
 */
export function orientationForDirection(direction: Vector3, target = new Quaternion()): Quaternion {
  const dir = direction.clone().normalize();
  const yaw = Math.atan2(-dir.x, dir.z);
  const remaining = Math.hypot(dir.x, dir.z);
  const pitch = Math.atan2(dir.y, remaining);
  const qy = new Quaternion().setFromAxisAngle(AXIS_Y, yaw);
  const qx = new Quaternion().setFromAxisAngle(AXIS_X, pitch);
  return target.copy(qx).multiply(qy);
}

export function orientationForLatLon(lat: number, lon: number, target = new Quaternion()): Quaternion {
  return orientationForDirection(latLonToDirection(lat, lon), target);
}

/**
 * Anchor direction for the flag/name card: nudged from the country's centre
 * towards local north so the label reads like an annotation beside the country
 * instead of covering it.
 */
export function labelAnchor(direction: Vector3, angularRadius: number): Vector3 {
  const dir = direction.clone().normalize();
  let up = AXIS_Y.clone().sub(dir.clone().multiplyScalar(dir.dot(AXIS_Y)));
  if (up.lengthSq() < 1e-6) up = Z_AXIS.clone().sub(dir.clone().multiplyScalar(dir.dot(Z_AXIS)));
  up.normalize();
  const angle = Math.max(0.05, Math.min(0.3, angularRadius * 0.8));
  return dir.multiplyScalar(Math.cos(angle)).add(up.multiplyScalar(Math.sin(angle))).normalize();
}

export { Z_AXIS };