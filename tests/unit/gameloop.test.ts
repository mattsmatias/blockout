import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FIXED_DT, SIMULATION } from '../../src/core/Config';
import { GameLoop } from '../../src/core/GameLoop';
import { EventBus } from '../../src/core/EventBus';
import { GameState } from '../../src/core/GameState';

function makeLoop() {
  let updates = 0;
  let lastAlpha = -1;
  const loop = new GameLoop({
    update: (dt) => {
      assert.equal(dt, FIXED_DT);
      updates++;
    },
    render: (alpha) => {
      lastAlpha = alpha;
    },
  });
  return { loop, get updates() { return updates; }, get alpha() { return lastAlpha; } };
}

describe('GameLoop (fixed timestep)', () => {
  for (const fps of [30, 60, 75, 144, 240]) {
    it(`runs exactly ${SIMULATION.TICK_RATE} steps per simulated second at ${fps} FPS`, () => {
      const h = makeLoop();
      for (let i = 0; i < fps; i++) h.loop.advance(1 / fps);
      assert.ok(Math.abs(h.updates - SIMULATION.TICK_RATE) <= 1, `got ${h.updates}`);
    });
  }

  it('render alpha stays in [0, 1)', () => {
    const h = makeLoop();
    for (let i = 0; i < 500; i++) {
      h.loop.advance(Math.random() * 0.05);
      assert.ok(h.alpha >= 0 && h.alpha < 1, `alpha ${h.alpha}`);
    }
  });

  it('clamps huge frames (tab switch) instead of spiralling', () => {
    const h = makeLoop();
    const steps = h.loop.advance(10);
    assert.ok(steps <= SIMULATION.MAX_STEPS_PER_FRAME);
    assert.ok(h.loop.stats.droppedTime > 9);
  });

  it('ignores negative / NaN deltas', () => {
    const h = makeLoop();
    assert.equal(h.loop.advance(-1), 0);
    assert.equal(h.loop.advance(Number.NaN), 0);
  });
});

describe('EventBus', () => {
  it('delivers typed events and unsubscribes', () => {
    const bus = new EventBus<{ ping: number }>();
    const got: number[] = [];
    const off = bus.on('ping', (n) => got.push(n));
    bus.emit('ping', 1);
    off();
    bus.emit('ping', 2);
    assert.deepEqual(got, [1]);
    assert.equal(bus.listenerCount('ping'), 0);
  });

  it('a handler removing itself does not skip others', () => {
    const bus = new EventBus<{ e: null }>();
    const calls: string[] = [];
    const offA = bus.on('e', () => {
      calls.push('a');
      offA();
    });
    bus.on('e', () => calls.push('b'));
    bus.emit('e', null);
    assert.deepEqual(calls, ['a', 'b']);
  });
});

describe('GameState', () => {
  it('entity ids are unique and never reused', () => {
    const s = new GameState();
    const a = s.createEntity('player', { x: 1, z: 1, radius: 0.3, avatarId: 'mack' });
    s.removeEntity(a.id);
    const b = s.createEntity('player', { x: 1, z: 1, radius: 0.3, avatarId: 'mack' });
    assert.notEqual(a.id, b.id);
  });

  it('snapshot is JSON-serialisable and round-trips', () => {
    const s = new GameState();
    s.createEntity('player', { x: 3, z: 4, radius: 0.3, avatarId: 'mack' });
    s.tick = 42;
    const snap = s.snapshot();
    const copy = JSON.parse(JSON.stringify(snap));
    assert.deepEqual(copy, snap);
    assert.equal(copy.tick, 42);
    assert.equal(copy.entities[0].transform.x, 3);
    assert.equal('prevX' in copy.entities[0].transform, false);
  });

  it('teleport clears interpolation history (no smear)', () => {
    const s = new GameState();
    const e = s.createEntity('player', { x: 0, z: 0, radius: 0.3, avatarId: 'mack' });
    s.teleport(e.id, 10, 10);
    assert.equal(e.transform.prevX, 10);
    assert.equal(e.transform.prevZ, 10);
  });
});
