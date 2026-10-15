import { CollisionWorld } from '../physics/CollisionWorld';
import type { Rect } from '../rendering/CameraRig';
import { validateMap, type MapDefinition } from './MapDefinition';
import { PROP_DEFS, resolveCollider, resolveProp } from './props/PropCatalog';

/**
 * Runtime world built from a MapDefinition. Owns simulation-side data only
 * (collision, bounds, points). Rendering builds its own view from the same definition.
 */
export class World {
  readonly collision: CollisionWorld;
  readonly playBounds: Rect;
  readonly visibleBounds: Rect;

  constructor(readonly def: MapDefinition) {
    const issues = [...validateMap(def), ...validateProps(def)];
    if (issues.length) throw new Error(`Map "${def.id}" is invalid:\n- ${issues.map((i) => i.message).join('\n- ')}`);
    this.playBounds = { minX: 0, minZ: 0, maxX: def.width, maxZ: def.depth };
    const m = def.visualMargin;
    this.visibleBounds = { minX: -m, minZ: -m, maxX: def.width + m, maxZ: def.depth + m };
    this.collision = new CollisionWorld(this.playBounds);
    for (const o of def.obstacles) {
      this.collision.add({ id: o.id, minX: o.x, minZ: o.z, maxX: o.x + o.width, maxZ: o.z + o.depth });
    }
    // Prop colliders come from the prop definition (box/circle/none), never from the sprite.
    def.props.forEach((p, i) => {
      const c = resolveCollider(PROP_DEFS[p.prop]!, p.x, p.z, p.rot);
      const id = `prop-${i}-${p.prop}`;
      if (!c) return;
      if (c.shape === 'circle') this.collision.addCircle(id, c.x, c.z, c.r);
      else this.collision.add({ id, minX: c.minX, minZ: c.minZ, maxX: c.maxX, maxZ: c.maxZ });
    });
  }

  spawnPoint(index = 0): { x: number; z: number } {
    const p = this.def.spawnPoints[index % this.def.spawnPoints.length]!;
    return { x: p.x, z: p.z };
  }

  dispose(): void {
    this.collision.clear();
  }
}

/** Checks prop placements against the catalogue, map bounds, obstacles and gameplay points. */
export function validateProps(def: MapDefinition, playerRadius = 0.3): Array<{ message: string }> {
  const out: Array<{ message: string }> = [];
  const rects: Array<{ name: string; minX: number; minZ: number; maxX: number; maxZ: number; solid: boolean }> = [];
  def.props.forEach((p, i) => {
    const d = PROP_DEFS[p.prop];
    if (!d) {
      out.push({ message: `prop #${i}: unknown prop "${p.prop}"` });
      return;
    }
    const resolved = resolveProp(d, p.rot);
    if (!resolved) {
      out.push({ message: `prop #${i} ${p.prop}: no sprite for rotation ${p.rot}` });
      return;
    }
    const [fx, fz] = resolved.footprint;
    const r = { name: `#${i} ${p.prop}`, minX: p.x - fx / 2, minZ: p.z - fz / 2, maxX: p.x + fx / 2, maxZ: p.z + fz / 2, solid: d.solid };
    if (r.minX < 0 || r.minZ < 0 || r.maxX > def.width || r.maxZ > def.depth) out.push({ message: `prop ${r.name} is outside the map` });
    for (const o of def.obstacles) {
      if (r.minX < o.x + o.width && r.maxX > o.x && r.minZ < o.z + o.depth && r.maxZ > o.z)
        out.push({ message: `prop ${r.name} overlaps obstacle ${o.id}` });
    }
    for (const q of rects) {
      if (r.minX < q.maxX && r.maxX > q.minX && r.minZ < q.maxZ && r.maxZ > q.minZ)
        out.push({ message: `prop ${r.name} overlaps prop ${q.name}` });
    }
    const col = resolveCollider(d, p.x, p.z, p.rot);
    if (col) {
      for (const pt of [...def.spawnPoints, ...def.devPoints]) {
        let dist: number;
        if (col.shape === 'circle') dist = Math.hypot(pt.x - col.x, pt.z - col.z) - col.r;
        else {
          const cx = Math.max(col.minX, Math.min(pt.x, col.maxX));
          const cz = Math.max(col.minZ, Math.min(pt.z, col.maxZ));
          dist = Math.hypot(pt.x - cx, pt.z - cz);
        }
        if (dist < playerRadius) out.push({ message: `prop ${r.name} blocks point ${pt.id}` });
      }
    }
    rects.push(r);
  });
  return out;
}
