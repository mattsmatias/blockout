import { PIXELS_PER_UNIT } from '../core/Config';
import { ISO_BASIS, worldOffsetToArtPixels } from '../utils/CoordinateUtils';
import type { Vec3 } from '../utils/MathUtils';
import type { PropPlacement } from '../world/MapDefinition';
import { PROP_DEFS, propSprite, resolveProp, type DepthMode } from '../world/props/PropCatalog';

/**
 * Pure geometry for a placed prop sprite (no three.js), shared by the renderer,
 * the debug overlay and the tests.
 *
 * SCREEN PLACEMENT — the sprite keeps its exact pixels:
 *   the sprite's bottom edge sits on the screen row of the footprint's front
 *   corner (the ground point nearest the camera), horizontally centred on the
 *   footprint centre, snapped to whole art pixels (+ optional anchorPx).
 *
 * DEPTH — "footprint" mode:
 *   instead of one flat card, the sprite is mapped onto the two camera-facing
 *   vertical faces of its footprint box (the +Z face and the +X face). Every
 *   screen column of the sprite therefore gets the depth of the object's real
 *   front surface at that column. A long bench seen at an angle is in front of a
 *   player on its far half and behind a player on its near half, exactly like a
 *   3D object, and the depth comes from world-space floor coordinates — never
 *   from the top of the PNG. Because the faces are vertical, the mapping from
 *   texture to screen is unchanged: no stretching, skewing or resampling.
 *
 *   "flat" mode: a ground decal drawn under everything (no depth write).
 */

export interface Footprint {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export interface PropVertex {
  world: Vec3;
  /** 0..1 across the sprite (left → right). */
  u: number;
  /** 0..1 up the sprite (bottom → top). */
  v: number;
}

export interface PropGeometry {
  prop: string;
  depth: DepthMode;
  footprint: Footprint;
  /** Sprite rectangle in absolute art pixels on the camera plane (y up). */
  rect: { x0: number; x1: number; yBottom: number; yTop: number };
  /** Atlas region [x, y, w, h] in source pixels. */
  atlas: [number, number, number, number];
  vertices: PropVertex[];
  triangles: number[];
  /** Floor anchor: footprint front corner, and the footprint centre. */
  anchor: { front: Vec3; centre: Vec3 };
}

const R = ISO_BASIS.right;
const U = ISO_BASIS.up;

/** Ground point on the footprint's camera-facing boundary under screen column `px` (art px). */
export function frontGroundPointAt(fp: Footprint, px: number): { x: number; z: number } {
  const w = px / PIXELS_PER_UNIT;
  const front = worldOffsetToArtPixels(fp.maxX, 0, fp.maxZ).px;
  if (px <= front) {
    // +Z face (z = maxZ), extended past its ends.
    return { x: (w - fp.maxZ * R.z) / R.x, z: fp.maxZ };
  }
  // +X face (x = maxX), extended past its ends.
  return { x: fp.maxX, z: (w - fp.maxX * R.x) / R.z };
}

/** Horizontal distance toward the camera (bigger = closer). Used for depth comparisons. */
export function viewDepth(x: number, z: number): number {
  return -(x * ISO_BASIS.forward.x + z * ISO_BASIS.forward.z);
}

export function buildPropGeometry(p: PropPlacement): PropGeometry | null {
  const def = PROP_DEFS[p.prop];
  const resolved = def && resolveProp(def, p.rot);
  const spr = resolved && propSprite(resolved.sprite);
  if (!def || !resolved || !spr) return null;

  const [fx, fz] = resolved.footprint;
  const fp: Footprint = { minX: p.x - fx / 2, minZ: p.z - fz / 2, maxX: p.x + fx / 2, maxZ: p.z + fz / 2 };
  const atlas = spr.atlas as [number, number, number, number];
  const w = atlas[2] * def.scale;
  const h = atlas[3] * def.scale;

  const centre = worldOffsetToArtPixels(p.x, 0, p.z);
  const front = worldOffsetToArtPixels(fp.maxX, 0, fp.maxZ);
  const [ax, ay] = def.anchorPx ?? [0, 0];
  const x0 = Math.round(centre.px - w / 2) + ax * def.scale;
  const yBottom = Math.round(front.py) - ay * def.scale;
  const rect = { x0, x1: x0 + w, yBottom, yTop: yBottom + h };

  const vertices: PropVertex[] = [];
  const triangles: number[] = [];
  const depth: DepthMode = def.depth ?? 'footprint';

  /** World point on the vertical line above ground point g whose screen row is `py`. */
  const lift = (g: { x: number; z: number }, py: number): Vec3 => {
    const y = (py / PIXELS_PER_UNIT - g.x * U.x - g.z * U.z) / U.y;
    return { x: g.x, y, z: g.z };
  };

  if (depth === 'flat') {
    // One card on the camera plane through the footprint centre (drawn without depth).
    const c = { x: p.x, z: p.z };
    const cardPoint = (px: number, py: number): Vec3 => {
      const a = px / PIXELS_PER_UNIT - (c.x * R.x + c.z * R.z);
      const b = py / PIXELS_PER_UNIT - (c.x * U.x + c.z * U.z);
      return { x: c.x + R.x * a + U.x * b, y: R.y * a + U.y * b, z: c.z + R.z * a + U.z * b };
    };
    vertices.push(
      { world: cardPoint(rect.x0, rect.yBottom), u: 0, v: 0 },
      { world: cardPoint(rect.x1, rect.yBottom), u: 1, v: 0 },
      { world: cardPoint(rect.x1, rect.yTop), u: 1, v: 1 },
      { world: cardPoint(rect.x0, rect.yTop), u: 0, v: 1 },
    );
    triangles.push(0, 1, 2, 0, 2, 3);
  } else {
    // Columns where the front boundary bends: sprite edges, footprint left/front/right corners.
    const cols = [
      rect.x0,
      rect.x1,
      worldOffsetToArtPixels(fp.minX, 0, fp.maxZ).px,
      front.px,
      worldOffsetToArtPixels(fp.maxX, 0, fp.minZ).px,
    ]
      .filter((c) => c >= rect.x0 && c <= rect.x1)
      .sort((a, b) => a - b)
      .filter((c, i, arr) => i === 0 || c - arr[i - 1]! > 1e-6);
    for (const px of cols) {
      const g = frontGroundPointAt(fp, px);
      const u = (px - rect.x0) / w;
      vertices.push({ world: lift(g, rect.yBottom), u, v: 0 }, { world: lift(g, rect.yTop), u, v: 1 });
    }
    for (let i = 0; i + 1 < cols.length; i++) {
      const a = i * 2;
      triangles.push(a, a + 2, a + 3, a, a + 3, a + 1);
    }
  }

  return {
    prop: p.prop,
    depth,
    footprint: fp,
    rect,
    atlas,
    vertices,
    triangles,
    anchor: { front: { x: fp.maxX, y: 0, z: fp.maxZ }, centre: { x: p.x, y: 0, z: p.z } },
  };
}

/**
 * Depth of the prop's drawn surface under screen column `px`, comparable with
 * viewDepth(x, z) of a character's feet. Returns null outside the sprite.
 */
export function propDepthAtColumn(g: PropGeometry, px: number): number | null {
  if (px < g.rect.x0 || px > g.rect.x1) return null;
  if (g.depth === 'flat') return -Infinity; // always under characters
  const pt = frontGroundPointAt(g.footprint, px);
  return viewDepth(pt.x, pt.z);
}

/** Whether a character standing at (x, z) is drawn in front of this prop (null = no overlap). */
export function characterInFront(g: PropGeometry, x: number, z: number): boolean | null {
  const px = worldOffsetToArtPixels(x, 0, z).px;
  const d = propDepthAtColumn(g, px);
  if (d === null) return null;
  return viewDepth(x, z) > d;
}
