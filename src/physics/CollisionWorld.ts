/**
 * Static collision on the XZ plane, independent of anything visual.
 * Colliders are axis-aligned boxes or circles in world units (metres). Fading,
 * hiding or re-drawing something in the renderer never touches this data.
 */

export interface AABB {
  id: string;
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  /** When set, the collider is this circle; min/max are then its bounding box. */
  circle?: { x: number; z: number; r: number };
}

/** Uniform-grid broadphase. Cell size ≈ 2 tiles keeps buckets tiny for city blocks. */
export class SpatialHash {
  private readonly cells = new Map<number, AABB[]>();
  constructor(private readonly cellSize = 2) {}

  private key(cx: number, cz: number): number {
    // Supports ±32k cells per axis — far beyond any planned map.
    return ((cx + 32768) << 16) | (cz + 32768);
  }

  insert(box: AABB): void {
    const c = this.cellSize;
    for (let cx = Math.floor(box.minX / c); cx <= Math.floor(box.maxX / c); cx++) {
      for (let cz = Math.floor(box.minZ / c); cz <= Math.floor(box.maxZ / c); cz++) {
        const k = this.key(cx, cz);
        let bucket = this.cells.get(k);
        if (!bucket) this.cells.set(k, (bucket = []));
        bucket.push(box);
      }
    }
  }

  /** Collects unique colliders overlapping the query rectangle into `out` (cleared first). */
  query(minX: number, minZ: number, maxX: number, maxZ: number, out: AABB[]): AABB[] {
    out.length = 0;
    const c = this.cellSize;
    for (let cx = Math.floor(minX / c); cx <= Math.floor(maxX / c); cx++) {
      for (let cz = Math.floor(minZ / c); cz <= Math.floor(maxZ / c); cz++) {
        const bucket = this.cells.get(this.key(cx, cz));
        if (!bucket) continue;
        for (const b of bucket) if (!out.includes(b)) out.push(b);
      }
    }
    return out;
  }

  clear(): void {
    this.cells.clear();
  }
}

/**
 * Closest point on a collider to (x, z). For a circle it is on the circle's edge
 * (or its centre when (x, z) is exactly the centre).
 */
export function closestPoint(c: AABB, x: number, z: number): { x: number; z: number; inside: boolean } {
  if (c.circle) {
    const dx = x - c.circle.x;
    const dz = z - c.circle.z;
    const d = Math.hypot(dx, dz);
    if (d <= c.circle.r) return { x: c.circle.x, z: c.circle.z, inside: true };
    return { x: c.circle.x + (dx / d) * c.circle.r, z: c.circle.z + (dz / d) * c.circle.r, inside: false };
  }
  const cx = Math.max(c.minX, Math.min(x, c.maxX));
  const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
  return { x: cx, z: cz, inside: cx === x && cz === z };
}

/** Signed gap between a circle (x, z, r) and a collider; negative = overlapping. */
export function gapTo(c: AABB, x: number, z: number, r: number): number {
  if (c.circle) return Math.hypot(x - c.circle.x, z - c.circle.z) - c.circle.r - r;
  const p = closestPoint(c, x, z);
  if (p.inside) return -r - Math.min(x - c.minX, c.maxX - x, z - c.minZ, c.maxZ - z);
  return Math.hypot(x - p.x, z - p.z) - r;
}

export class CollisionWorld {
  readonly boxes: AABB[] = [];
  private readonly hash = new SpatialHash(2);
  private readonly scratch: AABB[] = [];

  constructor(
    /** World bounds the player may never leave. */
    public readonly bounds: { minX: number; minZ: number; maxX: number; maxZ: number },
  ) {}

  add(box: AABB): void {
    if (!(box.maxX > box.minX && box.maxZ > box.minZ)) {
      throw new Error(`Collider "${box.id}" has non-positive size`);
    }
    this.boxes.push(box);
    this.hash.insert(box);
  }

  addCircle(id: string, x: number, z: number, r: number): void {
    if (!(r > 0)) throw new Error(`Collider "${id}" has non-positive radius`);
    this.add({ id, minX: x - r, minZ: z - r, maxX: x + r, maxZ: z + r, circle: { x, z, r } });
  }

  near(x: number, z: number, r: number): AABB[] {
    return this.hash.query(x - r, z - r, x + r, z + r, this.scratch);
  }

  /** True if a circle at (x, z) overlaps any collider or leaves the bounds. */
  overlaps(x: number, z: number, r: number): boolean {
    const b = this.bounds;
    if (x - r < b.minX || x + r > b.maxX || z - r < b.minZ || z + r > b.maxZ) return true;
    for (const c of this.near(x, z, r)) if (gapTo(c, x, z, r) < -1e-9) return true;
    return false;
  }

  /** Colliders touching a circle within `tolerance` (for debug display). */
  contacts(x: number, z: number, r: number, tolerance = 0.02): string[] {
    const out: string[] = [];
    for (const c of this.near(x, z, r + tolerance)) if (gapTo(c, x, z, r) <= tolerance) out.push(c.id);
    return out;
  }

  clear(): void {
    this.boxes.length = 0;
    this.hash.clear();
  }
}
