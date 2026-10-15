import type { CollisionWorld } from './CollisionWorld';

/**
 * Moves a circle through the collision world with sliding.
 *
 * - Sub-steps so no single step exceeds half the radius → fast movement can never
 *   tunnel through thin walls.
 * - Each sub-step pushes the circle out of every overlapping box along the
 *   shortest separation, which yields natural wall sliding and lets the circle
 *   roll around convex corners instead of snagging.
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
    x += sx;
    z += sz;
    // Two relaxation passes resolve inside corners (two walls at once).
    for (let pass = 0; pass < 2; pass++) {
      for (const box of world.near(x, z, r)) {
        const cx = Math.max(box.minX, Math.min(x, box.maxX));
        const cz = Math.max(box.minZ, Math.min(z, box.maxZ));
        let nx = x - cx;
        let nz = z - cz;
        const d2 = nx * nx + nz * nz;
        if (d2 >= r * r) continue;
        blocked = true;
        if (d2 > 1e-12) {
          const d = Math.sqrt(d2);
          const push = r - d;
          x += (nx / d) * push;
          z += (nz / d) * push;
        } else {
          // Centre is inside the box: exit through the nearest face.
          const left = x - box.minX;
          const right = box.maxX - x;
          const top = z - box.minZ;
          const bottom = box.maxZ - z;
          const m = Math.min(left, right, top, bottom);
          nx = nz = 0;
          if (m === left) x = box.minX - r;
          else if (m === right) x = box.maxX + r;
          else if (m === top) z = box.minZ - r;
          else z = box.maxZ + r;
        }
      }
    }
    const b = world.bounds;
    const clampedX = Math.min(Math.max(x, b.minX + r), b.maxX - r);
    const clampedZ = Math.min(Math.max(z, b.minZ + r), b.maxZ - r);
    if (clampedX !== x || clampedZ !== z) blocked = true;
    x = clampedX;
    z = clampedZ;
  }
  return { x, z, blocked };
}
