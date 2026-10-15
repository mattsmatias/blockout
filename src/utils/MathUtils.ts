/** Small allocation-free math helpers shared by simulation and rendering. */

export interface Vec2 {
  x: number;
  z: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const DEG2RAD = Math.PI / 180;

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Frame-rate independent exponential approach factor.
 * Applying `x += (target - x) * expDecay(k, dt)` converges identically for any dt split.
 */
export function expDecay(stiffness: number, dt: number): number {
  return 1 - Math.exp(-stiffness * dt);
}

export function length2(x: number, z: number): number {
  return Math.sqrt(x * x + z * z);
}

/** Moves `current` toward `target` by at most `maxDelta`. */
export function moveTowards(current: number, target: number, maxDelta: number): number {
  const d = target - current;
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
}

export function approxEqual(a: number, b: number, eps = 1e-9): boolean {
  return Math.abs(a - b) <= eps;
}
