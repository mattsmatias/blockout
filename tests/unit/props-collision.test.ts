import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FIXED_DT, PLAYER } from '../../src/core/Config';
import { GameState } from '../../src/core/GameState';
import { gapTo } from '../../src/physics/CollisionWorld';
import { moveCircle } from '../../src/physics/MovementResolver';
import { updatePlayerMovement } from '../../src/player/PlayerMovement';
import { screenIntentToWorld } from '../../src/utils/CoordinateUtils';
import { DEV_TEST_MAP } from '../../src/world/maps/dev-test/map';
import { PROP_DEFS, resolveCollider, type PropRotation } from '../../src/world/props/PropCatalog';
import { World } from '../../src/world/World';

const R = PLAYER.RADIUS;
const ROTS = [0, 90, 180, 270] as const;
const BX = 20; // open ground in the dev map (x 20–31, z 23–31 is the park)
const BZ = 27;

function worldWith(props: Array<{ prop: string; x: number; z: number; rot?: PropRotation }>): World {
  return new World({ ...DEV_TEST_MAP, props, spawnPoints: [{ id: 's', x: 16, z: 16 }], devPoints: [] });
}

function noOverlap(w: World, x: number, z: number): boolean {
  for (const c of w.collision.near(x, z, R)) if (gapTo(c, x, z, R) < -1e-6) return false;
  return true;
}

/** Drives the player with screen-relative input for `seconds`; checks every tick. */
function drive(w: World, start: { x: number; z: number }, input: { moveX: number; moveY: number; run: boolean }, seconds: number) {
  const s = new GameState();
  const e = s.createEntity('player', { ...start, radius: R, avatarId: 'mack' });
  let ok = true;
  for (let i = 0; i < Math.round(seconds / FIXED_DT); i++) {
    s.beginTick();
    updatePlayerMovement(e, input, w.collision, FIXED_DT);
    if (!noOverlap(w, e.transform.x, e.transform.z)) ok = false;
  }
  return { e, ok };
}

/** Screen-relative input that walks along world direction (dx, dz). */
function inputToward(dx: number, dz: number, run = false) {
  // Invert screenIntentToWorld numerically (it is linear).
  const a = screenIntentToWorld(1, 0);
  const b = screenIntentToWorld(0, 1);
  const det = a.x * b.z - a.z * b.x;
  const ix = (dx * b.z - dz * b.x) / det;
  const iy = (a.x * dz - a.z * dx) / det;
  const l = Math.hypot(ix, iy) || 1;
  return { moveX: ix / l, moveY: iy / l, run };
}

describe('bench collision: approach from every direction', () => {
  for (const rot of ROTS) {
    const w = worldWith([{ prop: 'bench', x: BX + 4, z: BZ, rot }]);
    const cx = BX + 4;
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * Math.PI * 2;
      const dir = { x: Math.cos(ang), z: Math.sin(ang) };
      for (const run of [false, true]) {
        it(`rot ${rot}: from ${Math.round((ang * 180) / Math.PI)}° ${run ? 'running' : 'walking'} toward the centre never enters the bench`, () => {
          const start = { x: cx + dir.x * 3, z: BZ + dir.z * 3 };
          const { e, ok } = drive(w, start, inputToward(-dir.x, -dir.z, run), 2.5);
          assert.ok(ok, 'overlapped during the approach');
          const c = resolveCollider(PROP_DEFS['bench']!, cx, BZ, rot)!;
          assert.equal(c.shape, 'box');
          assert.ok(Math.hypot(e.transform.x - cx, e.transform.z - BZ) > 0.3, 'reached the inside');
        });
      }
    }
  }

  it('tunnelling: a 50 m single step cannot pass through the bench', () => {
    const w = worldWith([{ prop: 'bench', x: BX + 4, z: BZ, rot: 0 }]);
    const res = moveCircle(w.collision, { x: BX + 4, z: BZ + 3 }, R, 0, -50);
    assert.ok(res.z > BZ, `ended at z=${res.z}`);
    assert.ok(noOverlap(w, res.x, res.z));
  });

  it('pushing straight into the bench for 5 s: no jitter through, no drift inside', () => {
    const w = worldWith([{ prop: 'bench', x: BX + 4, z: BZ, rot: 0 }]);
    const { e, ok } = drive(w, { x: BX + 4, z: BZ + 2 }, inputToward(0, -1, true), 5);
    assert.ok(ok);
    const c = resolveCollider(PROP_DEFS['bench']!, BX + 4, BZ, 0)!;
    if (c.shape !== 'box') throw new Error('box expected');
    close(e.transform.z, c.maxZ + R, 1e-6);
  });

  it('slides along the bench when walking diagonally into it, and does not stick at the corner', () => {
    const w = worldWith([{ prop: 'bench', x: BX + 4, z: BZ, rot: 0 }]);
    const { e, ok } = drive(w, { x: BX + 2.6, z: BZ + 1.2 }, inputToward(1, -1), 3);
    assert.ok(ok);
    assert.ok(e.transform.x > BX + 5.2, `stuck at x=${e.transform.x.toFixed(2)}`);
  });

  it('fits between two benches when the gap is wider than the player, not when narrower', () => {
    const fp = PROP_DEFS['bench']!.footprint; // rot 0: [x, z]
    for (const [gap, shouldPass] of [
      [0.7, true],
      [0.5, false],
    ] as const) {
      const xA = BX + 2;
      const xB = xA + fp[0] + gap; // side by side along X with `gap` between ends
      const w = worldWith([
        { prop: 'bench', x: xA, z: BZ, rot: 0 },
        { prop: 'bench', x: xB, z: BZ, rot: 0 },
      ]);
      const gapX = xA + fp[0] / 2 + gap / 2;
      const { e, ok } = drive(w, { x: gapX, z: BZ + 1.5 }, inputToward(0, -1), 2);
      assert.ok(ok, `overlap with gap ${gap}`);
      assert.equal(e.transform.z < BZ - 0.6, shouldPass, `gap ${gap}: z=${e.transform.z.toFixed(2)}`);
    }
  });

  it('walks freely past the bench without touching it', () => {
    const w = worldWith([{ prop: 'bench', x: BX + 4, z: BZ, rot: 90 }]);
    const { e } = drive(w, { x: BX + 2, z: BZ + 3 }, inputToward(1, 0), 1.2);
    close(e.transform.x - (BX + 2), 1.2 * PLAYER.WALK_SPEED - 0.5 * PLAYER.WALK_SPEED * 0.08, 0.2);
  });
});

describe('collider shapes for future assets', () => {
  it('circle colliders (lamps, bollards) block and let the player slide around', () => {
    const w = worldWith([{ prop: 'street-lamp', x: BX + 4, z: BZ }]);
    const c = w.collision.boxes.find((b) => b.circle)!;
    assert.ok(c, 'lamp collider is a circle');
    const { e, ok } = drive(w, { x: BX + 2, z: BZ + 0.05 }, inputToward(1, 0), 1.5);
    assert.ok(ok);
    assert.ok(e.transform.x > BX + 5, 'slid around the post');
  });

  it('walk-through props have no collider; flat decals render under characters', () => {
    const w = worldWith([
      { prop: 'manhole', x: BX + 4, z: BZ },
      { prop: 'cone', x: BX + 6, z: BZ },
    ]);
    assert.equal(w.collision.boxes.length, DEV_TEST_MAP.obstacles.length);
    assert.equal(PROP_DEFS['manhole']!.depth, 'flat');
  });

  it('collider offset and size rotate with the prop', () => {
    const def = { ...PROP_DEFS['bench']!, collider: { shape: 'box' as const, size: [1, 0.4] as [number, number], offset: [0, -0.2] as [number, number] } };
    const c0 = resolveCollider(def, 0, 0, 0)!;
    const c90 = resolveCollider(def, 0, 0, 90)!;
    assert.deepEqual(c0, { shape: 'box', minX: -0.5, minZ: -0.4, maxX: 0.5, maxZ: 0 });
    assert.deepEqual(c90, { shape: 'box', minX: -0.4, minZ: -0.5, maxX: 0, maxZ: 0.5 });
  });
});

function close(a: number, b: number, eps: number) {
  assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
}
