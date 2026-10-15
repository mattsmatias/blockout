import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RENDER } from '../../src/core/Config';
import { artResolution, CameraRig, pickZoom } from '../../src/rendering/CameraRig';
import { worldOffsetToArtPixels } from '../../src/utils/CoordinateUtils';

function rig(w = 1920, h = 1080, zoom = 3) {
  const r = new CameraRig();
  r.setViewport(w, h, zoom);
  r.visibleBounds = { minX: -24, minZ: -24, maxX: 56, maxZ: 56 };
  return r;
}

function footprintInside(r: CameraRig): boolean {
  const b = r.visibleBounds;
  return r.footprintOffsets().every((o) => {
    const x = r.target.x + o.x;
    const z = r.target.z + o.z;
    return x >= b.minX - 1e-6 && x <= b.maxX + 1e-6 && z >= b.minZ - 1e-6 && z <= b.maxZ + 1e-6;
  });
}

describe('camera', () => {
  it('never shows outside the visible bounds, even at map corners', () => {
    for (const [w, h] of [
      [1920, 1080],
      [1080, 2340],
      [2340, 1080],
      [800, 600],
    ] as const) {
      const r = rig(w, h, pickZoom(w, h, RENDER.ZOOM_LEVELS, RENDER.MIN_ART_PIXELS_SHORT_SIDE));
      for (const p of [
        { x: 0, z: 0 },
        { x: 32, z: 32 },
        { x: 0, z: 32 },
        { x: 32, z: 0 },
        { x: -100, z: 500 },
      ]) {
        r.snapTo(p);
        assert.ok(footprintInside(r), `${w}x${h} leaked at ${JSON.stringify(p)}`);
      }
    }
  });

  it('keeps the player in view when the map is large enough', () => {
    const r = rig();
    for (const p of [
      { x: 0.3, z: 0.3 },
      { x: 31.7, z: 31.7 },
      { x: 16, z: 16 },
    ]) {
      r.snapTo(p);
      const o = worldOffsetToArtPixels(p.x - r.target.x, 0, p.z - r.target.z);
      const { halfW, halfH } = r.halfExtents();
      assert.ok(Math.abs(o.px) / 45.25 < halfW && Math.abs(o.py) / 45.25 < halfH, `player off-screen at ${JSON.stringify(p)}`);
    }
  });

  it('centres instead of jittering when the view is larger than the map', () => {
    const r = new CameraRig();
    r.setViewport(4000, 4000, 1);
    r.visibleBounds = { minX: 0, minZ: 0, maxX: 4, maxZ: 4 };
    r.snapTo({ x: 0, z: 0 });
    const a = { ...r.target };
    r.snapTo({ x: 4, z: 4 });
    assert.deepEqual(r.target, a);
  });

  it('follow smoothing is frame-rate independent and never overshoots', () => {
    const run = (fps: number) => {
      const r = rig();
      r.snapTo({ x: 10, z: 10 });
      let max = 10;
      for (let i = 0; i < fps; i++) {
        r.follow({ x: 15, z: 10 }, 1 / fps);
        max = Math.max(max, r.target.x);
      }
      return { x: r.target.x, max };
    };
    const a = run(30);
    const b = run(144);
    assert.ok(Math.abs(a.x - b.x) < 1e-6, `${a.x} vs ${b.x}`);
    assert.ok(a.max <= 15 && b.max <= 15, 'overshoot');
  });

  it('settles exactly (no endless sub-pixel creep)', () => {
    const r = rig();
    r.snapTo({ x: 10, z: 10 });
    for (let i = 0; i < 600; i++) r.follow({ x: 12, z: 11 }, 1 / 60);
    assert.equal(r.target.x, 12);
    assert.equal(r.target.z, 11);
  });

  it('rendered target is pixel-snapped and stable for a static target', () => {
    const r = rig();
    r.snapTo({ x: 13.37, z: 7.21 });
    const a = r.renderTarget();
    const b = r.renderTarget();
    assert.deepEqual(a, b);
    const px = worldOffsetToArtPixels(a.x, a.y, a.z);
    assert.ok(Math.abs(px.px - Math.round(px.px)) < 1e-6);
  });

  it('zoom is an integer and respects the minimum visible art size', () => {
    for (const [w, h] of [
      [1920, 1080],
      [1080, 2340],
      [3840, 2160],
      [390, 844],
    ] as const) {
      const z = pickZoom(w, h, RENDER.ZOOM_LEVELS, RENDER.MIN_ART_PIXELS_SHORT_SIDE);
      assert.ok(Number.isInteger(z));
      if (z > 1) assert.ok(Math.min(w, h) / z >= RENDER.MIN_ART_PIXELS_SHORT_SIDE);
    }
  });

  it('art resolution is always even (prevents half-pixel offset)', () => {
    for (const [w, h, z] of [
      [1921, 1081, 3],
      [1080, 2340, 3],
      [7, 9, 1],
    ] as const) {
      const a = artResolution(w, h, z);
      assert.equal(a.w % 2, 0);
      assert.equal(a.h % 2, 0);
      assert.ok(a.w * z >= w && a.h * z >= h);
    }
  });
});
