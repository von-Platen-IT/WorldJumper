import { Quaternion, Vector3 } from 'three';
import { latLonToDirection } from './geoProjection';

const AXIS_Y = new Vector3(0, 1, 0);
const AXIS_X = new Vector3(1, 0, 0);
const Z_AXIS = new Vector3(0, 0, 1);

// Scratch objects: these helpers run on every country switch and must not
// allocate. They are not reentrant, which is fine for this single-threaded,
// non-nested usage.
const SCRATCH_DIR = new Vector3();
const SCRATCH_QY = new Quaternion();
const SCRATCH_QX = new Quaternion();

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
  const dir = SCRATCH_DIR.copy(direction).normalize();
  const yaw = Math.atan2(-dir.x, dir.z);
  const remaining = Math.hypot(dir.x, dir.z);
  const pitch = Math.atan2(dir.y, remaining);
  SCRATCH_QY.setFromAxisAngle(AXIS_Y, yaw);
  SCRATCH_QX.setFromAxisAngle(AXIS_X, pitch);
  return target.copy(SCRATCH_QX).multiply(SCRATCH_QY);
}

export function orientationForLatLon(lat: number, lon: number, target = new Quaternion()): Quaternion {
  return orientationForDirection(latLonToDirection(lat, lon, SCRATCH_DIR), target);
}

export { Z_AXIS };
