/**
 * BLOCKOUT coordinate systems — the single source of truth.
 *
 *  WORLD      Right-handed, metres. X = east (screen lower-right), Y = up,
 *             Z = south (screen lower-left). Movement happens on the XZ plane.
 *  TILE       Integer grid cells. Tile (tx, tz) covers world [tx, tx+1) × [tz, tz+1).
 *             Tile centre = (tx + 0.5, tz + 0.5).
 *  COLLISION  Identical to world XZ. Colliders never use pixel units.
 *  SCREEN     CSS pixels, origin top-left, y down. Depends on camera target,
 *             zoom (integer device-px per art-px) and viewport size.
 *  ART PIXEL  The low-resolution render-target pixel. One art pixel = 1/PIXELS_PER_UNIT
 *             world units along the camera right/up axes.
 *  SPRITE ANCHOR
 *             Sprite frames are authored with a foot anchor (ax, ay) in frame pixels.
 *             The anchor pixel is placed exactly at the entity's world position (y = floor).
 *
 * All conversions are pure functions with no dependency on three.js so that the
 * simulation (and a future server) can use them.
 */

import { PIXELS_PER_UNIT, PROJECTION } from '../core/Config';
import { DEG2RAD, type Vec2, type Vec3 } from './MathUtils';

export interface CameraBasis {
  /** Unit vector pointing to screen-right, in world space. */
  right: Vec3;
  /** Unit vector pointing to screen-up, in world space. */
  up: Vec3;
  /** Unit vector the camera looks along, in world space. */
  forward: Vec3;
}

export function computeCameraBasis(
  yawDeg: number = PROJECTION.YAW_DEG,
  elevationDeg: number = PROJECTION.ELEVATION_DEG,
): CameraBasis {
  const yaw = yawDeg * DEG2RAD;
  const el = elevationDeg * DEG2RAD;
  const ce = Math.cos(el);
  const se = Math.sin(el);
  // Camera sits on the +X/+Z/+Y side of its target and looks back toward it.
  const forward = { x: -ce * Math.sin(yaw), y: -se, z: -ce * Math.cos(yaw) };
  const right = { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
  // up = right × forward
  const up = {
    x: right.y * forward.z - right.z * forward.y,
    y: right.z * forward.x - right.x * forward.z,
    z: right.x * forward.y - right.y * forward.x,
  };
  return { right, up, forward };
}

/** Shared default basis (immutable by convention). */
export const ISO_BASIS: Readonly<CameraBasis> = Object.freeze(computeCameraBasis());

// ---------------------------------------------------------------- world ↔ tile

export function worldToTile(x: number, z: number): { tx: number; tz: number } {
  return { tx: Math.floor(x), tz: Math.floor(z) };
}

export function tileToWorldCenter(tx: number, tz: number): Vec2 {
  return { x: tx + 0.5, z: tz + 0.5 };
}

// ------------------------------------------------------------ world ↔ view/art

/** Projects a world-space offset onto the camera plane, in art pixels (y up). */
export function worldOffsetToArtPixels(
  dx: number,
  dy: number,
  dz: number,
  basis: CameraBasis = ISO_BASIS,
): { px: number; py: number } {
  return {
    px: (dx * basis.right.x + dy * basis.right.y + dz * basis.right.z) * PIXELS_PER_UNIT,
    py: (dx * basis.up.x + dy * basis.up.y + dz * basis.up.z) * PIXELS_PER_UNIT,
  };
}

export interface ScreenView {
  /** World point at the centre of the screen. */
  target: Vec3;
  /** Device-independent zoom: CSS pixels per art pixel. */
  zoom: number;
  width: number;
  height: number;
}

/** World → CSS screen pixels (origin top-left, y down). */
export function worldToScreen(p: Vec3, view: ScreenView, basis: CameraBasis = ISO_BASIS): { sx: number; sy: number } {
  const a = worldOffsetToArtPixels(p.x - view.target.x, p.y - view.target.y, p.z - view.target.z, basis);
  return {
    sx: view.width / 2 + a.px * view.zoom,
    sy: view.height / 2 - a.py * view.zoom,
  };
}

/**
 * CSS screen pixels → world point on the horizontal plane y = planeY.
 * Inverse of worldToScreen restricted to a plane (used for picking / touch targets).
 */
export function screenToWorldOnPlane(
  sx: number,
  sy: number,
  view: ScreenView,
  planeY = 0,
  basis: CameraBasis = ISO_BASIS,
): Vec3 {
  const px = (sx - view.width / 2) / view.zoom / PIXELS_PER_UNIT;
  const py = -(sy - view.height / 2) / view.zoom / PIXELS_PER_UNIT;
  // Point on the camera plane through the target.
  const ox = view.target.x + basis.right.x * px + basis.up.x * py;
  const oy = view.target.y + basis.right.y * px + basis.up.y * py;
  const oz = view.target.z + basis.right.z * px + basis.up.z * py;
  // Ray along forward until y = planeY.
  const t = (planeY - oy) / basis.forward.y;
  return { x: ox + basis.forward.x * t, y: planeY, z: oz + basis.forward.z * t };
}

// ------------------------------------------------------ screen intent → world

/**
 * Converts a screen-relative movement intent (x = right, y = up, both in [-1, 1])
 * into a world XZ direction. Pressing "up" walks toward the top of the screen.
 * The result keeps the input's magnitude (so analog sticks stay analog).
 */
export function screenIntentToWorld(ix: number, iy: number, basis: CameraBasis = ISO_BASIS): Vec2 {
  // Screen-up projected to ground: the horizontal component of camera up.
  const ux = basis.up.x;
  const uz = basis.up.z;
  const ul = Math.hypot(ux, uz) || 1;
  const rx = basis.right.x;
  const rz = basis.right.z;
  const rl = Math.hypot(rx, rz) || 1;
  return {
    x: (rx / rl) * ix + (ux / ul) * iy,
    z: (rz / rl) * ix + (uz / ul) * iy,
  };
}

// ------------------------------------------------------------- pixel snapping

/**
 * Snaps a world point so that it lands exactly on the art-pixel grid of the camera
 * plane. Moving only along the camera's forward axis keeps the snapped point
 * visually identical — this is what removes sub-pixel shimmer.
 */
export function snapToArtPixelGrid(p: Vec3, basis: CameraBasis = ISO_BASIS): Vec3 {
  const a = worldOffsetToArtPixels(p.x, p.y, p.z, basis);
  const dx = (Math.round(a.px) - a.px) / PIXELS_PER_UNIT;
  const dy = (Math.round(a.py) - a.py) / PIXELS_PER_UNIT;
  return {
    x: p.x + basis.right.x * dx + basis.up.x * dy,
    y: p.y + basis.right.y * dx + basis.up.y * dy,
    z: p.z + basis.right.z * dx + basis.up.z * dy,
  };
}
