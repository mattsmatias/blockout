import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateMap, tileAt, type MapDefinition } from '../../src/world/MapDefinition';
import { World } from '../../src/world/World';
import { DEV_TEST_MAP } from '../../src/world/maps/dev-test/map';
import { PLAYER } from '../../src/core/Config';

describe('map data', () => {
  it('dev test map is valid', () => {
    assert.deepEqual(validateMap(DEV_TEST_MAP), []);
  });

  it('every spawn and teleport point is free for the player collider', () => {
    const w = new World(DEV_TEST_MAP);
    for (const p of [...DEV_TEST_MAP.spawnPoints, ...DEV_TEST_MAP.devPoints]) {
      assert.equal(w.collision.overlaps(p.x, p.z, PLAYER.RADIUS), false, `${p.id} blocked`);
    }
  });

  it('collision is built from obstacle data (not from visuals)', () => {
    const w = new World(DEV_TEST_MAP);
    for (const o of DEV_TEST_MAP.obstacles) assert.ok(w.collision.boxes.some((b) => b.id === o.id), o.id);
    const b = DEV_TEST_MAP.obstacles[0]!;
    assert.equal(w.collision.overlaps(b.x + b.width / 2, b.z + b.depth / 2, 0.1), true);
  });

  it('rejects malformed maps with readable errors', () => {
    const bad: MapDefinition = {
      ...DEV_TEST_MAP,
      terrain: { ...DEV_TEST_MAP.terrain, rows: DEV_TEST_MAP.terrain.rows.slice(0, 5) },
      obstacles: [...DEV_TEST_MAP.obstacles, { id: 'oob', x: 40, z: 0, width: 1, depth: 1, height: 1, look: 'block' }],
      spawnPoints: [{ id: 'in-block', x: 6, z: 5 }],
    };
    const msgs = validateMap(bad).map((i) => i.message).join('\n');
    assert.match(msgs, /rows, expected 32/);
    assert.match(msgs, /oob is outside/);
    assert.match(msgs, /in-block is inside obstacle block-a/);
    assert.throws(() => new World(bad), /invalid/);
  });

  it('tile lookup', () => {
    assert.equal(tileAt(DEV_TEST_MAP, 15, 15), 'road');
    assert.equal(tileAt(DEV_TEST_MAP, -1, 0), null);
  });

  it('visible bounds include the decorative margin', () => {
    const w = new World(DEV_TEST_MAP);
    assert.equal(w.visibleBounds.minX, -DEV_TEST_MAP.visualMargin);
    assert.equal(w.visibleBounds.maxX, DEV_TEST_MAP.width + DEV_TEST_MAP.visualMargin);
  });
});

describe('world props', () => {
  it('every prop definition points at a real atlas region', async () => {
    const { validatePropDefs } = await import('../../src/world/props/PropCatalog');
    assert.deepEqual(validatePropDefs(), []);
  });

  it('dev map props are valid: inside the map, not overlapping obstacles, each other or teleport points', async () => {
    const { validateProps } = await import('../../src/world/World');
    assert.deepEqual(validateProps(DEV_TEST_MAP), []);
  });

  it('solid props become colliders; non-solid ones do not', () => {
    const map = {
      ...DEV_TEST_MAP,
      props: [
        { prop: 'bench', x: 13.2, z: 7.5 },
        { prop: 'cone', x: 17.3, z: 11.6 },
      ],
    };
    const w = new World(map);
    assert.equal(w.collision.boxes.length, DEV_TEST_MAP.obstacles.length + 1);
    assert.equal(w.collision.overlaps(13.2, 7.5, 0.1), true);
    assert.equal(w.collision.overlaps(17.3, 11.6, 0.05), false);
  });

  it('rejects unknown props and props placed on obstacles', async () => {
    const { validateProps } = await import('../../src/world/World');
    const msgs = validateProps({
      ...DEV_TEST_MAP,
      props: [
        { prop: 'ufo', x: 5, z: 5 },
        { prop: 'bench', x: 5, z: 5 },
      ],
    })
      .map((i) => i.message)
      .join('\n');
    assert.match(msgs, /unknown prop "ufo"/);
    assert.match(msgs, /overlaps obstacle block-a/);
  });
});

describe('prop rotations', () => {
  it('90° and 270° swap the footprint; every bench rotation has its own sprite', async () => {
    const { PROP_DEFS, resolveProp } = await import('../../src/world/props/PropCatalog');
    const bench = PROP_DEFS['bench']!;
    assert.deepEqual(resolveProp(bench, 0), { sprite: 'bench-r0', footprint: [1.7, 0.75] });
    assert.deepEqual(resolveProp(bench, 90), { sprite: 'bench-r90', footprint: [0.75, 1.7] });
    assert.deepEqual(resolveProp(bench, 180)!.sprite, 'bench-r180');
    assert.deepEqual(resolveProp(bench, 270)!.footprint, [0.75, 1.7]);
  });

  it('rejects a rotation the prop has no picture for', async () => {
    const { validateProps } = await import('../../src/world/World');
    const msgs = validateProps({ ...DEV_TEST_MAP, props: [{ prop: 'cone', x: 20, z: 25, rot: 90 }] }).map((i) => i.message);
    assert.match(msgs.join(), /no sprite for rotation 90/);
  });

  it('rotated bench collision follows the rotated footprint', () => {
    const w = new World({ ...DEV_TEST_MAP, props: [{ prop: 'bench', x: 24, z: 27, rot: 90 }] });
    assert.equal(w.collision.overlaps(24, 27.7, 0.05), true); // along Z: inside
    assert.equal(w.collision.overlaps(24.6, 27, 0.05), false); // along X: outside 0.375 half-width
  });
});
