import { closestPoint, gapTo, type CollisionWorld } from './CollisionWorld';

/**
 * Moves a circle through the collision world with sliding.
 *
 * - The move is checked BEFORE it is accepted: the circle advances in sub-steps of
 *   at most half its radius and is pushed out of every collider after each one, so
 *   fast movement can never tunnel through thin walls or bench legs.
 * - Each push uses the shortest separation from the collider (box or circle),
 *   which gives natural wall sliding and rolls around convex corners and posts
 *   instead of snagging. Diagonal input slides along whichever face it hits.
 * - If pushes from two sides cannot agree (a gap narrower than the player), the
 *   sub-step is rejected and retried along X only, then Z only, else the circle
 *   stays put — so the result is never left overlapping a collider.
 */
export function moveCircle(
  world: CollisionWorld,
  pos: { x: number; z: number },
  r: number,
  dx: number,
  dz: number,
): { x: number; z: number; blocked: boolean } {
  const dist = Math.hypot(dx, dz);
  const maxStep = r * 0.5;
  const steps = Math.max(1, Math.ceil(dist / maxStep));
  const sx = dx / steps;
  const sz = dz / steps;
  let x = pos.x;
  let z = pos.z;
  let blocked = false;

  for (let i = 0; i < steps; i++) {
    const prevX = x;
    const prevZ = z;
    let r1 = resolve(world, x + sx, z + sz, r, sx, sz);
    if (overlapsAny(world, r1.x, r1.z, r)) {
      // Contradictory pushes: fall back to axis-separated moves from the last valid spot.
      const ax = resolve(world, prevX + sx, prevZ, r, sx, 0);
      const az = resolve(world, prevX, prevZ + sz, r, 0, sz);
      if (!overlapsAny(world, ax.x, ax.z, r) && Math.abs(sx) >= 1e-12) r1 = { ...ax, blocked: true };
      else if (!overlapsAny(world, az.x, az.z, r) && Math.abs(sz) >= 1e-12) r1 = { ...az, blocked: true };
      else r1 = { x: prevX, z: prevZ, blocked: true };
    }
    x = r1.x;
    z = r1.z;
    if (r1.blocked) blocked = true;
    const b = world.bounds;
    const clampedX = Math.min(Math.max(x, b.minX + r), b.maxX - r);
    const clampedZ = Math.min(Math.max(z, b.minZ + r), b.maxZ - r);
    if (clampedX !== x || clampedZ !== z) blocked = true;
    x = clampedX;
    z = clampedZ;
  }
  return { x, z, blocked };
}

function overlapsAny(world: CollisionWorld, x: number, z: number, r: number): boolean {
  for (const c of world.near(x, z, r)) if (gapTo(c, x, z, r) < -1e-7) return true;
  return false;
}

/** Pushes a circle at (x, z) out of nearby colliders (shortest separation). */
function resolve(world: CollisionWorld, x: number, z: number, r: number, sx: number, sz: number): { x: number; z: number; blocked: boolean } {
  let blocked = false;
  // A few relaxation passes resolve inside corners and gaps between two colliders.
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const c of world.near(x, z, r)) {
      const p = closestPoint(c, x, z);
      if (c.circle) {
        const cx = c.circle.x;
        const cz = c.circle.z;
        let nx = x - cx;
        let nz = z - cz;
        let d = Math.hypot(nx, nz);
        const minD = c.circle.r + r;
        if (d >= minD) continue;
        if (d < 1e-9) {
          // Exactly on the centre: push back the way we came.
          nx = -sx;
          nz = -sz;
          d = Math.hypot(nx, nz) || 1;
        }
        x = cx + (nx / d) * minD;
        z = cz + (nz / d) * minD;
        blocked = moved = true;
        continue;
      }
      if (p.inside) {
        // Centre is inside the box: exit through the nearest face.
        const left = x - c.minX;
        const right = c.maxX - x;
        const top = z - c.minZ;
        const bottom = c.maxZ - z;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = c.minX - r;
        else if (m === right) x = c.maxX + r;
        else if (m === top) z = c.minZ - r;
        else z = c.maxZ + r;
        blocked = moved = true;
        continue;
      }
      const nx = x - p.x;
      const nz = z - p.z;
      const d2 = nx * nx + nz * nz;
      if (d2 >= r * r) continue;
      const d = Math.sqrt(d2);
      const push = r - d;
      x += (nx / d) * push;
      z += (nz / d) * push;
      blocked = moved = true;
    }
    if (!moved) break;
  }
  return { x, z, blocked };
}
