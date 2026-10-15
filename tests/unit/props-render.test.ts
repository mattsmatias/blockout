import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import { PROPS_ATLAS } from '../../src/assets/conceptProps.generated';
import { buildPropGeometry, characterInFront, viewDepth, type PropGeometry } from '../../src/rendering/PropGeometry';
import { PropLayerView } from '../../src/rendering/PropLayerView';
import { worldOffsetToArtPixels } from '../../src/utils/CoordinateUtils';
import { DEV_TEST_MAP } from '../../src/world/maps/dev-test/map';
import { PROP_DEFS, propSprite, resolveProp, type PropRotation } from '../../src/world/props/PropCatalog';

const ROTS = [0, 90, 180, 270] as const;
const close = (a: number, b: number, eps: number, msg: string) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);

function bench(rot: PropRotation, x = 25.3, z = 27.1): PropGeometry {
  return buildPropGeometry({ prop: 'bench', x, z, rot })!;
}

describe('bench sprites: placement in all four directions', () => {
  for (const rot of ROTS) {
    it(`rot ${rot}: drawn 1:1 (no stretch/skew), on whole art pixels, standing on its footprint`, () => {
      const r = resolveProp(PROP_DEFS['bench']!, rot)!;
      const spr = propSprite(r.sprite)!;
      const g = bench(rot);
      // Size equals the sprite → no scaling.
      assert.equal(g.rect.x1 - g.rect.x0, spr.width);
      assert.equal(g.rect.yTop - g.rect.yBottom, spr.height);
      // Every vertex lands exactly where its texel belongs: u/v map linearly to the
      // screen rectangle, so the picture is neither stretched nor skewed.
      for (const v of g.vertices) {
        const s = worldOffsetToArtPixels(v.world.x, v.world.y, v.world.z);
        close(s.px, g.rect.x0 + v.u * spr.width, 1e-6, 'vertex x');
        close(s.py, g.rect.yBottom + v.v * spr.height, 1e-6, 'vertex y');
      }
      // Pixel-perfect: rectangle on whole art pixels.
      for (const n of [g.rect.x0, g.rect.x1, g.rect.yBottom, g.rect.yTop]) assert.equal(n, Math.round(n));
      // Base on the footprint's front corner (±0.5 px snapping), centred on the footprint.
      const [fx, fz] = r.footprint;
      close(g.rect.yBottom, worldOffsetToArtPixels(25.3 + fx / 2, 0, 27.1 + fz / 2).py, 0.5, 'base row');
      close((g.rect.x0 + g.rect.x1) / 2, worldOffsetToArtPixels(25.3, 0, 27.1).px, 1, 'centred');
    });
  }

  it('the renderer uploads exactly the PropGeometry vertices (float32)', () => {
    const map = { ...DEV_TEST_MAP, props: [{ prop: 'bench', x: 25.3, z: 27.1, rot: 0 as const }] };
    const view = new PropLayerView(map, new THREE.Texture(), PROPS_ATLAS);
    const pos = (view.root.children[0] as THREE.Mesh).geometry.getAttribute('position');
    const g = bench(0);
    assert.equal(pos.count, g.vertices.length);
    g.vertices.forEach((v, i) => close(pos.getY(i), v.world.y, 1e-4, `y${i}`));
    view.dispose();
  });

  it('all four views are the same bench: widths within 4 px', () => {
    const ws = ['bench-r0', 'bench-r90', 'bench-r180', 'bench-r270'].map((k) => propSprite(k)!.width);
    assert.ok(Math.max(...ws) - Math.min(...ws) <= 4, `widths ${ws}`);
  });
});

/**
 * Ground-truth ordering for a character next to a box footprint: a character
 * beyond a camera-facing face (+Z or +X side) is in front; beyond a far face
 * (−Z or −X side) is behind. Positions are chosen where that is unambiguous.
 */
describe('depth order: character vs bench from every side', () => {
  const r = 0.3;
  for (const rot of ROTS) {
    const g = bench(rot);
    const f = g.footprint;
    const cases: Array<[string, number, number, boolean]> = [];
    // Walk along each face at 7 points, standing just outside it.
    for (let t = 0.05; t <= 0.951; t += 0.15) {
      const x = f.minX + (f.maxX - f.minX) * t;
      const z = f.minZ + (f.maxZ - f.minZ) * t;
      cases.push([`+Z side t=${t.toFixed(2)}`, x, f.maxZ + r + 0.01, true]);
      cases.push([`−Z side t=${t.toFixed(2)}`, x, f.minZ - r - 0.01, false]);
      cases.push([`+X side t=${t.toFixed(2)}`, f.maxX + r + 0.01, z, true]);
      cases.push([`−X side t=${t.toFixed(2)}`, f.minX - r - 0.01, z, false]);
    }
    it(`rot ${rot}: character is in front on the near sides and behind on the far sides`, () => {
      let checked = 0;
      for (const [name, x, z, expectFront] of cases) {
        const got = characterInFront(g, x, z);
        if (got === null) continue; // no screen overlap → order does not matter
        checked++;
        assert.equal(got, expectFront, `rot ${rot} ${name} (x ${x.toFixed(2)}, z ${z.toFixed(2)})`);
      }
      assert.ok(checked >= 16, `only ${checked} overlapping cases`);
    });
  }

  it('the old single-card method fails the same check (regression guard)', () => {
    // Old method: whole sprite at the depth of the front corner.
    const g = bench(0);
    const f = g.footprint;
    const oldDepth = viewDepth(f.maxX, f.maxZ);
    const x = f.minX + 0.6;
    const z = f.maxZ + 0.31; // in front of the bench's left half
    const playerDepth = viewDepth(x, z);
    assert.equal(playerDepth > oldDepth, false, 'old method put the player behind');
    assert.equal(characterInFront(g, x, z), true, 'new method puts the player in front');
  });
});
