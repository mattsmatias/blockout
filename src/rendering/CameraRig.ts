import { CAMERA, PIXELS_PER_UNIT } from '../core/Config';
import { expDecay, type Vec3 } from '../utils/MathUtils';
import { ISO_BASIS, screenToWorldOnPlane, snapToArtPixelGrid, type CameraBasis } from '../utils/CoordinateUtils';

export interface Rect {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/**
 * Pure camera logic (no three.js): follow smoothing, bounds clamping, pixel snapping.
 *
 * The smoothed target is kept at full precision. Only the *rendered* position is
 * snapped to the art-pixel grid, so snapping never feeds back into the smoothing
 * (which is what causes camera jitter in many pixel-art engines).
 */
export class CameraRig {
  /** Smoothed, clamped look-at point (full precision). */
  readonly target: Vec3 = { x: 0, y: 0, z: 0 };
  /** Viewport in DEVICE pixels. */
  viewWidth = 1;
  viewHeight = 1;
  /** Device pixels per art pixel (integer). */
  zoom = 2;
  /** World area the camera may show. */
  visibleBounds: Rect = { minX: -1e6, minZ: -1e6, maxX: 1e6, maxZ: 1e6 };

  constructor(private readonly basis: CameraBasis = ISO_BASIS) {}

  setViewport(width: number, height: number, zoom: number): void {
    this.viewWidth = Math.max(1, width);
    this.viewHeight = Math.max(1, height);
    this.zoom = Math.max(1, Math.round(zoom));
  }

  /** Half-size of the view in world units on the camera plane. */
  halfExtents(): { halfW: number; halfH: number } {
    return {
      halfW: this.viewWidth / this.zoom / PIXELS_PER_UNIT / 2,
      halfH: this.viewHeight / this.zoom / PIXELS_PER_UNIT / 2,
    };
  }

  /** Instantly places the camera (no smoothing) — used on spawn/teleport. */
  snapTo(p: { x: number; z: number }): void {
    this.target.x = p.x;
    this.target.z = p.z;
    this.clamp();
  }

  /** Critically-damped follow. Converges identically regardless of frame rate. */
  follow(p: { x: number; z: number }, dt: number): void {
    const k = expDecay(CAMERA.FOLLOW_STIFFNESS, dt);
    this.target.x += (p.x - this.target.x) * k;
    this.target.z += (p.z - this.target.z) * k;
    if (Math.abs(p.x - this.target.x) < CAMERA.SETTLE_EPSILON) this.target.x = p.x;
    if (Math.abs(p.z - this.target.z) < CAMERA.SETTLE_EPSILON) this.target.z = p.z;
    this.clamp();
  }

  /**
   * Ground footprint offsets of the four screen corners relative to the target.
   * Because the projection is linear, moving the target moves the footprint 1:1.
   */
  footprintOffsets(): Array<{ x: number; z: number }> {
    const view = { target: { x: 0, y: 0, z: 0 }, zoom: this.zoom, width: this.viewWidth, height: this.viewHeight };
    const w = this.viewWidth;
    const h = this.viewHeight;
    return [
      screenToWorldOnPlane(0, 0, view, 0, this.basis),
      screenToWorldOnPlane(w, 0, view, 0, this.basis),
      screenToWorldOnPlane(0, h, view, 0, this.basis),
      screenToWorldOnPlane(w, h, view, 0, this.basis),
    ];
  }

  /** Keeps every screen corner's ground point inside `visibleBounds`. */
  clamp(): void {
    const offs = this.footprintOffsets();
    let minOx = Infinity, maxOx = -Infinity, minOz = Infinity, maxOz = -Infinity;
    for (const o of offs) {
      if (o.x < minOx) minOx = o.x;
      if (o.x > maxOx) maxOx = o.x;
      if (o.z < minOz) minOz = o.z;
      if (o.z > maxOz) maxOz = o.z;
    }
    const b = this.visibleBounds;
    this.target.x = clampAxis(this.target.x, b.minX - minOx, b.maxX - maxOx);
    this.target.z = clampAxis(this.target.z, b.minZ - minOz, b.maxZ - maxOz);
  }

  /** Position actually used for rendering: snapped to the art-pixel grid. */
  renderTarget(): Vec3 {
    return snapToArtPixelGrid(this.target, this.basis);
  }
}

/** Clamp, or centre if the allowed interval is empty (view larger than the map). */
function clampAxis(v: number, lo: number, hi: number): number {
  if (lo > hi) return (lo + hi) / 2;
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Chooses the largest integer zoom that still shows at least `minArt` art pixels
 * along the viewport's short side (device pixels in, so DPR is accounted for).
 */
export function pickZoom(deviceW: number, deviceH: number, levels: readonly number[], minArt: number): number {
  const short = Math.min(deviceW, deviceH);
  let best = levels[0] ?? 1;
  for (const z of levels) if (short / z >= minArt) best = z;
  return best;
}

/**
 * Low-resolution render target size for a viewport. Always even in both axes so
 * the camera target sits on an art-pixel corner — otherwise the whole image is
 * offset by half an art pixel and snapping can't remove shimmer.
 */
export function artResolution(deviceW: number, deviceH: number, zoom: number): { w: number; h: number } {
  const even = (n: number) => Math.max(2, Math.ceil(n / 2) * 2);
  return { w: even(deviceW / zoom), h: even(deviceH / zoom) };
}
