import * as THREE from 'three';
import { PIXELS_PER_UNIT } from '../core/Config';
import { ISO_BASIS } from '../utils/CoordinateUtils';
import { CameraRig } from './CameraRig';

/**
 * three.js adapter for CameraRig: a true orthographic camera with a fixed
 * true-isometric orientation (yaw 45°, elevation ≈35.26° → 30° ground edges, see Config).
 * The rig owns all logic; this class only mirrors it into a THREE camera.
 */
export class IsometricCamera {
  readonly rig = new CameraRig();
  readonly camera: THREE.OrthographicCamera;
  /** Distance from target along -forward. Large enough to keep tall buildings in front of the near plane. */
  private static readonly DISTANCE = 100;

  constructor() {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    const b = ISO_BASIS;
    this.camera.up.set(b.up.x, b.up.y, b.up.z);
  }

  /** Frustum in world units matching the render target exactly (1 art pixel = 1/PIXELS_PER_UNIT). */
  setArtResolution(artW: number, artH: number): void {
    const hw = artW / PIXELS_PER_UNIT / 2;
    const hh = artH / PIXELS_PER_UNIT / 2;
    this.camera.left = -hw;
    this.camera.right = hw;
    this.camera.top = hh;
    this.camera.bottom = -hh;
    this.camera.updateProjectionMatrix();
  }

  /** Applies the snapped rig target to the THREE camera. Call once per rendered frame. */
  sync(): void {
    const t = this.rig.renderTarget();
    const f = ISO_BASIS.forward;
    const d = IsometricCamera.DISTANCE;
    this.camera.position.set(t.x - f.x * d, t.y - f.y * d, t.z - f.z * d);
    this.camera.lookAt(t.x, t.y, t.z);
    this.camera.updateMatrixWorld();
  }
}
