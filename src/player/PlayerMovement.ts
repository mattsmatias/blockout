import { PLAYER } from '../core/Config';
import type { EntityState } from '../core/GameState';
import type { InputActions } from '../input/InputManager';
import type { CollisionWorld } from '../physics/CollisionWorld';
import { moveCircle } from '../physics/MovementResolver';
import { screenIntentToWorld } from '../utils/CoordinateUtils';

/**
 * Player locomotion system. Runs only inside the fixed simulation step.
 * Input is already device-agnostic; this converts screen intent → world velocity,
 * applies acceleration and resolves collisions.
 */
export function updatePlayerMovement(e: EntityState, input: Readonly<InputActions>, world: CollisionWorld, dt: number): void {
  const dir = screenIntentToWorld(input.moveX, input.moveY);
  const intent = Math.min(1, Math.hypot(dir.x, dir.z));
  const running = input.run && intent > 0;
  const maxSpeed = running ? PLAYER.RUN_SPEED : PLAYER.WALK_SPEED;

  // Target velocity preserves analog magnitude; length never exceeds maxSpeed,
  // so diagonal movement is never faster than cardinal.
  const tvx = dir.x * maxSpeed;
  const tvz = dir.z * maxSpeed;

  const m = e.motion;
  const accelerating = intent > 0;
  const rate = (accelerating ? PLAYER.RUN_SPEED / PLAYER.ACCEL_TIME : PLAYER.RUN_SPEED / PLAYER.DECEL_TIME) * dt;
  const dvx = tvx - m.vx;
  const dvz = tvz - m.vz;
  const dv = Math.hypot(dvx, dvz);
  if (dv <= rate) {
    m.vx = tvx;
    m.vz = tvz;
  } else {
    m.vx += (dvx / dv) * rate;
    m.vz += (dvz / dv) * rate;
  }
  m.running = running;

  if (m.vx === 0 && m.vz === 0) return;

  const t = e.transform;
  const res = moveCircle(world, t, e.radius, m.vx * dt, m.vz * dt);
  // Remove the velocity component that was absorbed by a wall so we don't build
  // up speed while pressed against it.
  if (res.blocked) {
    const ax = (res.x - t.x) / dt;
    const az = (res.z - t.z) / dt;
    if (Math.hypot(ax, az) < Math.hypot(m.vx, m.vz)) {
      m.vx = ax;
      m.vz = az;
    }
  }
  t.x = res.x;
  t.z = res.z;
  if (accelerating) t.facing = Math.atan2(dir.z, dir.x);
}
