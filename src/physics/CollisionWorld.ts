/**
 * Static collision on the XZ plane, independent of anything visual.
 * Colliders are axis-aligned boxes in world units. Fading or hiding a wall in
 * the renderer never touches this data.
 */

export interface AABB {
  id: string;
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
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

  /** Collects unique boxes overlapping the query rectangle into `out` (cleared first). */
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

  near(x: number, z: number, r: number): AABB[] {
    return this.hash.query(x - r, z - r, x + r, z + r, this.scratch);
  }

  /** True if a circle at (x, z) overlaps any collider or leaves the bounds. */
  overlaps(x: number, z: number, r: number): boolean {
    const b = this.bounds;
    if (x - r < b.minX || x + r > b.maxX || z - r < b.minZ || z + r > b.maxZ) return true;
    for (const box of this.near(x, z, r)) {
      const cx = Math.max(box.minX, Math.min(x, box.maxX));
      const cz = Math.max(box.minZ, Math.min(z, box.maxZ));
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < r * r - 1e-9) return true;
    }
    return false;
  }

  clear(): void {
    this.boxes.length = 0;
    this.hash.clear();
  }
}
