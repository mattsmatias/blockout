import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PIXELS_PER_UNIT, PROJECTION } from '../../src/core/Config';
import {
  ISO_BASIS,
  screenIntentToWorld,
  screenToWorldOnPlane,
  snapToArtPixelGrid,
  tileToWorldCenter,
  worldOffsetToArtPixels,
  worldToScreen,
  worldToTile,
} from '../../src/utils/CoordinateUtils';

const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

describe('coordinate system', () => {
  it('camera basis is orthonormal', () => {
    const { right: r, up: u, forward: f } = ISO_BASIS;
    const dot = (a: typeof r, b: typeof r) => a.x * b.x + a.y * b.y + a.z * b.z;
    close(dot(r, r), 1);
    close(dot(u, u), 1);
    close(dot(f, f), 1);
    close(dot(r, u), 0);
    close(dot(r, f), 0);
    close(dot(u, f), 0);
    assert.ok(u.y > 0, 'screen-up must point upward in world');
  });

  it('a 1×1 ground tile projects to the configured 2:1 diamond', () => {
    // Diamond corners: (0,0) (1,0) (1,1) (0,1)
    const pts = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ].map(([x, z]) => worldOffsetToArtPixels(x!, 0, z!));
    const xs = pts.map((p) => p.px);
    const ys = pts.map((p) => p.py);
    close(Math.max(...xs) - Math.min(...xs), PROJECTION.TILE_PIXEL_WIDTH, 1e-6);
    close(Math.max(...ys) - Math.min(...ys), PROJECTION.TILE_PIXEL_HEIGHT, 1e-6);
  });

  it('+X goes screen lower-right, +Z goes screen lower-left, +Y goes up', () => {
    const view = { target: { x: 0, y: 0, z: 0 }, zoom: 1, width: 200, height: 200 };
    const ex = worldToScreen({ x: 1, y: 0, z: 0 }, view);
    const ez = worldToScreen({ x: 0, y: 0, z: 1 }, view);
    const ey = worldToScreen({ x: 0, y: 1, z: 0 }, view);
    assert.ok(ex.sx > 100 && ex.sy > 100);
    assert.ok(ez.sx < 100 && ez.sy > 100);
    close(ey.sx, 100);
    assert.ok(ey.sy < 100);
  });

  it('world → screen → world round-trips on the ground plane', () => {
    const view = { target: { x: 12.3, y: 0, z: 7.7 }, zoom: 3, width: 1280, height: 720 };
    for (const p of [
      { x: 12.3, y: 0, z: 7.7 },
      { x: 0, y: 0, z: 0 },
      { x: 20.5, y: 0, z: 3.25 },
    ]) {
      const s = worldToScreen(p, view);
      const back = screenToWorldOnPlane(s.sx, s.sy, view, 0);
      close(back.x, p.x, 1e-9);
      close(back.z, p.z, 1e-9);
    }
  });

  it('world ↔ tile conversion', () => {
    assert.deepEqual(worldToTile(3.99, 0.01), { tx: 3, tz: 0 });
    assert.deepEqual(worldToTile(-0.01, 5), { tx: -1, tz: 5 });
    assert.deepEqual(tileToWorldCenter(3, 4), { x: 3.5, z: 4.5 });
    const c = tileToWorldCenter(7, 9);
    assert.deepEqual(worldToTile(c.x, c.z), { tx: 7, tz: 9 });
  });

  it('pixel snapping lands on integer art pixels and does not change the visual position by more than half a pixel', () => {
    for (const p of [
      { x: 0.123, y: 0, z: 9.87 },
      { x: 15.5, y: 0, z: 16.01 },
      { x: -3.3, y: 1.2, z: 4.4 },
    ]) {
      const s = snapToArtPixelGrid(p);
      const a = worldOffsetToArtPixels(s.x, s.y, s.z);
      close(a.px, Math.round(a.px), 1e-6);
      close(a.py, Math.round(a.py), 1e-6);
      const o = worldOffsetToArtPixels(p.x, p.y, p.z);
      assert.ok(Math.abs(a.px - o.px) <= 0.5 + 1e-9);
      assert.ok(Math.abs(a.py - o.py) <= 0.5 + 1e-9);
    }
  });

  it('pixel snapping is idempotent', () => {
    const s1 = snapToArtPixelGrid({ x: 4.321, y: 0, z: 1.234 });
    const s2 = snapToArtPixelGrid(s1);
    close(s1.x, s2.x, 1e-9);
    close(s1.y, s2.y, 1e-9);
    close(s1.z, s2.z, 1e-9);
  });

  it('screen "up" intent walks toward the top of the screen', () => {
    const d = screenIntentToWorld(0, 1);
    close(Math.hypot(d.x, d.z), 1);
    close(d.x, -Math.SQRT1_2);
    close(d.z, -Math.SQRT1_2);
    const view = { target: { x: 0, y: 0, z: 0 }, zoom: 1, width: 100, height: 100 };
    const s = worldToScreen({ x: d.x, y: 0, z: d.z }, view);
    close(s.sx, 50, 1e-9);
    assert.ok(s.sy < 50);
  });

  it('screen "right" intent walks toward the right of the screen', () => {
    const d = screenIntentToWorld(1, 0);
    const view = { target: { x: 0, y: 0, z: 0 }, zoom: 1, width: 100, height: 100 };
    const s = worldToScreen({ x: d.x, y: 0, z: d.z }, view);
    assert.ok(s.sx > 50);
    close(s.sy, 50, 1e-9);
  });

  it('PIXELS_PER_UNIT derives from tile width', () => {
    close(PIXELS_PER_UNIT * Math.SQRT2, PROJECTION.TILE_PIXEL_WIDTH);
  });
});
