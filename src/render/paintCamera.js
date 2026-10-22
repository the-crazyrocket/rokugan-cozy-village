// Fixed isometric camera shared by the game and the art pipeline.
import * as THREE from 'three';

export const ISO_ELEVATION = 35.264; // degrees, true isometric
export const GAME_AZIMUTH = 45; // degrees; camera sits at +x/+z looking toward -x/-z
export const PAINT_AZIMUTHS = [45, 225];

/** Unit vector pointing FROM the target TOWARD the camera. */
export function cameraOffsetDir(azDeg, elDeg = ISO_ELEVATION) {
  const az = THREE.MathUtils.degToRad(azDeg), el = THREE.MathUtils.degToRad(elDeg);
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
}

/**
 * Orthographic paint camera framing a geometry's bounding box from (az, el).
 * Returns the camera plus serialisable matrices (column-major arrays).
 */
export function computePaintCamera(geometry, azDeg, { elDeg = ISO_ELEVATION, margin = 0.06 } = {}) {
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  const center = bb.getCenter(new THREE.Vector3());
  const radius = bb.getSize(new THREE.Vector3()).length() / 2;
  const dir = cameraOffsetDir(azDeg, elDeg);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
  cam.position.copy(center).addScaledVector(dir, radius * 2 + 2);
  cam.up.set(0, 1, 0);
  cam.lookAt(center);
  cam.updateMatrixWorld(true);
  const view = cam.matrixWorldInverse.clone();
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const v = new THREE.Vector3();
  for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) {
    v.set(x, y, z).applyMatrix4(view);
    minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
    minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
    minZ = Math.min(minZ, v.z); maxZ = Math.max(maxZ, v.z);
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const half = Math.max(maxX - minX, maxY - minY) / 2 * (1 + margin * 2);
  cam.left = cx - half; cam.right = cx + half; cam.bottom = cy - half; cam.top = cy + half;
  cam.near = -maxZ - 0.05; cam.far = -minZ + 0.05;
  cam.updateProjectionMatrix();
  const vp = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, view);
  return {
    camera: cam,
    json: {
      azimuth: azDeg,
      elevation: elDeg,
      viewMatrix: view.toArray(),
      projectionMatrix: cam.projectionMatrix.toArray(),
      viewProjectionMatrix: vp.toArray(),
      cameraPosition: cam.position.toArray(),
      // direction the camera looks along (from camera into the scene), asset space
      viewDir: dir.clone().negate().toArray(),
      frustum: { left: cam.left, right: cam.right, top: cam.top, bottom: cam.bottom, near: cam.near, far: cam.far },
      bounds: { min: bb.min.toArray(), max: bb.max.toArray() },
    },
  };
}
