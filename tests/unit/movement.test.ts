import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FIXED_DT, PLAYER } from '../../src/core/Config';
import { GameLoop } from '../../src/core/GameLoop';
import { GameState } from '../../src/core/GameState';
import { InputManager, type InputActions, type InputSource } from '../../src/input/InputManager';
import { KeyboardInput, type KeyEventTarget, type KeyboardEventLike } from '../../src/input/KeyboardInput';
import { VirtualStick } from '../../src/input/TouchInput';
import { CollisionWorld } from '../../src/physics/CollisionWorld';
import { moveCircle } from '../../src/physics/MovementResolver';
import { updatePlayerMovement } from '../../src/player/PlayerMovement';
import { World } from '../../src/world/World';
import { DEV_TEST_MAP } from '../../src/world/maps/dev-test/map';

const R = PLAYER.RADIUS;

function openWorld(): CollisionWorld {
  return new CollisionWorld({ minX: -1000, minZ: -1000, maxX: 1000, maxZ: 1000 });
}

function simulate(world: CollisionWorld, actions: InputActions, seconds: number, start = { x: 0, z: 0 }) {
  const s = new GameState();
  const e = s.createEntity('player', { ...start, radius: R, avatarId: 'mack' });
  const ticks = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < ticks; i++) {
    s.beginTick();
    updatePlayerMovement(e, actions, world, FIXED_DT);
  }
  return e;
}

class FakeKeys implements KeyEventTarget {
  private l = new Map<string, Set<(e: KeyboardEventLike) => void>>();
  addEventListener(t: string, fn: (e: KeyboardEventLike) => void) {
    if (!this.l.has(t)) this.l.set(t, new Set());
    this.l.get(t)!.add(fn);
  }
  removeEventListener(t: string, fn: (e: KeyboardEventLike) => void) {
    this.l.get(t)?.delete(fn);
  }
  fire(t: 'keydown' | 'keyup' | 'blur', code?: string) {
    for (const fn of this.l.get(t) ?? []) fn({ code });
  }
  count() {
    let n = 0;
    for (const s of this.l.values()) n += s.size;
    return n;
  }
}

describe('player movement', () => {
  it('diagonal movement is not faster than cardinal', () => {
    const w = openWorld();
    const card = simulate(w, { moveX: 1, moveY: 0, run: false }, 2);
    const diag = simulate(w, { moveX: Math.SQRT1_2, moveY: Math.SQRT1_2, run: false }, 2);
    const dc = Math.hypot(card.transform.x, card.transform.z);
    const dd = Math.hypot(diag.transform.x, diag.transform.z);
    assert.ok(Math.abs(dc - dd) < 1e-6, `cardinal ${dc} vs diagonal ${dd}`);
  });

  it('keyboard diagonal (W+D) is normalised', () => {
    const keys = new FakeKeys();
    const im = new InputManager();
    im.add(new KeyboardInput(keys));
    keys.fire('keydown', 'KeyW');
    keys.fire('keydown', 'KeyD');
    const a = im.sample();
    assert.ok(Math.abs(Math.hypot(a.moveX, a.moveY) - 1) < 1e-9);
  });

  it('reaches walk and run speed', () => {
    const w = openWorld();
    const walk = simulate(w, { moveX: 1, moveY: 0, run: false }, 1);
    const run = simulate(w, { moveX: 1, moveY: 0, run: true }, 1);
    assert.ok(Math.abs(Math.hypot(walk.motion.vx, walk.motion.vz) - PLAYER.WALK_SPEED) < 1e-6);
    assert.ok(Math.abs(Math.hypot(run.motion.vx, run.motion.vz) - PLAYER.RUN_SPEED) < 1e-6);
  });

  it('distance travelled is independent of rendering FPS', () => {
    const results: number[] = [];
    for (const fps of [24, 60, 144]) {
      const s = new GameState();
      const world = openWorld();
      const e = s.createEntity('player', { x: 0, z: 0, radius: R, avatarId: 'mack' });
      const actions = { moveX: 1, moveY: 0.3, run: true };
      const loop = new GameLoop({
        update: (dt) => {
          s.beginTick();
          updatePlayerMovement(e, actions, world, dt);
        },
        render: () => {},
      });
      for (let i = 0; i < fps * 3; i++) loop.advance(1 / fps);
      results.push(Math.hypot(e.transform.x, e.transform.z));
    }
    const max = Math.max(...results);
    const min = Math.min(...results);
    // At most one fixed tick of difference from frame-boundary rounding.
    assert.ok(max - min <= PLAYER.RUN_SPEED * FIXED_DT + 1e-9, `distances ${results.join(', ')}`);
  });

  it('stops when input is released', () => {
    const w = openWorld();
    const s = new GameState();
    const e = s.createEntity('player', { x: 0, z: 0, radius: R, avatarId: 'mack' });
    for (let i = 0; i < 60; i++) updatePlayerMovement(e, { moveX: 1, moveY: 0, run: false }, w, FIXED_DT);
    for (let i = 0; i < 30; i++) updatePlayerMovement(e, { moveX: 0, moveY: 0, run: false }, w, FIXED_DT);
    assert.equal(Math.hypot(e.motion.vx, e.motion.vz), 0);
  });

  it('keyboard and touch produce identical gameplay actions', () => {
    const keys = new FakeKeys();
    const kb = new InputManager();
    kb.add(new KeyboardInput(keys));
    keys.fire('keydown', 'KeyD');
    const a = { ...kb.sample() };

    const stick = new VirtualStick(50, 0.1);
    stick.begin(1, 100, 100);
    stick.move(150, 100); // full right
    const touch = new InputManager();
    const src: InputSource = {
      contribute(out) {
        out.moveX += stick.x;
        out.moveY += stick.y;
        if (stick.running) out.run = true;
      },
      dispose() {},
    };
    touch.add(src);
    const b = { ...touch.sample() };
    assert.ok(Math.abs(a.moveX - b.moveX) < 1e-9 && Math.abs(a.moveY - b.moveY) < 1e-9);
  });

  it('virtual stick: dead zone, up is positive, full deflection runs', () => {
    const s = new VirtualStick(50, 0.2, 0.9);
    s.begin(1, 0, 0);
    s.move(5, 0);
    assert.equal(s.magnitude, 0);
    s.move(0, -100); // finger moved up (screen y decreases)
    assert.ok(s.y > 0.99);
    assert.ok(s.running);
    s.end();
    assert.equal(s.magnitude, 0);
  });

  it('window blur releases held keys', () => {
    const keys = new FakeKeys();
    const im = new InputManager();
    const kb = new KeyboardInput(keys);
    im.add(kb);
    keys.fire('keydown', 'KeyW');
    keys.fire('blur');
    assert.equal(im.sample().moveY, 0);
    kb.dispose();
    assert.equal(keys.count(), 0, 'listeners removed on dispose');
  });
});

describe('collision', () => {
  it('player cannot pass through a thin wall even at very high speed', () => {
    const w = openWorld();
    w.add({ id: 'wall', minX: 1, minZ: -5, maxX: 1.1, maxZ: 5 });
    const res = moveCircle(w, { x: 0, z: 0 }, R, 50, 0); // 50 m in one call
    assert.ok(res.x <= 1 - R + 1e-9, `ended at ${res.x}`);
    assert.ok(res.blocked);
  });

  it('slides along a wall instead of stopping', () => {
    const w = openWorld();
    w.add({ id: 'wall', minX: 1, minZ: -50, maxX: 2, maxZ: 50 });
    const res = moveCircle(w, { x: 1 - R, z: 0 }, R, 1, 1);
    assert.ok(Math.abs(res.x - (1 - R)) < 1e-6);
    assert.ok(res.z > 0.99);
  });

  it('does not snag on a small pillar corner', () => {
    const w = openWorld();
    w.add({ id: 'pillar', minX: 2, minZ: 0, maxX: 2.6, maxZ: 0.6 });
    // Walk along +X with the circle grazing the pillar's corner (overlap 0.05 m).
    let pos = { x: 0, z: -0.25 };
    for (let i = 0; i < 120; i++) pos = moveCircle(w, pos, R, 3.2 * FIXED_DT, 0);
    assert.ok(pos.x > 3, `stuck at x=${pos.x}`);
  });

  it('resolves an inside corner (two walls) without jitter or penetration', () => {
    const w = openWorld();
    w.add({ id: 'a', minX: 2, minZ: -5, maxX: 3, maxZ: 2 });
    w.add({ id: 'b', minX: -5, minZ: 2, maxX: 3, maxZ: 3 });
    let pos = { x: 0, z: 0 };
    for (let i = 0; i < 200; i++) pos = moveCircle(w, pos, R, 0.05, 0.05);
    assert.ok(!w.overlaps(pos.x, pos.z, R - 1e-6));
    assert.ok(Math.abs(pos.x - (2 - R)) < 1e-3 && Math.abs(pos.z - (2 - R)) < 1e-3);
  });

  it('player stays inside the map bounds', () => {
    const w = new CollisionWorld({ minX: 0, minZ: 0, maxX: 10, maxZ: 10 });
    const res = moveCircle(w, { x: 5, z: 5 }, R, -100, 100);
    assert.ok(res.x >= R && res.z <= 10 - R);
  });

  it('fits through a one-tile gap', () => {
    const world = new World(DEV_TEST_MAP);
    // Gap between wall-1 (x 21..24) and wall-2 (x 25..28) at z 22..22.4
    let pos = { x: 24.5, z: 21 };
    for (let i = 0; i < 60; i++) pos = moveCircle(world.collision, pos, R, 0, 3.2 * FIXED_DT);
    assert.ok(pos.z > 23, `blocked at z=${pos.z}`);
  });
});
