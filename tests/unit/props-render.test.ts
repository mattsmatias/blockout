import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import { PROPS_ATLAS } from '../../src/assets/conceptProps.generated';
import { PropLayerView } from '../../src/rendering/PropLayerView';
import { worldOffsetToArtPixels } from '../../src/utils/CoordinateUtils';
import { DEV_TEST_MAP } from '../../src/world/maps/dev-test/map';
import { PROP_DEFS, propSprite, resolveProp, type PropRotation } from '../../src/world/props/PropCatalog';

/** Builds the prop layer for one bench and returns its 4 quad corners projected to art pixels. */
function benchQuad(rot: PropRotation, x = 25.3, z = 27.1) {
  const map = { ...DEV_TEST_MAP, props: [{ prop: 'bench', x, z, rot }] };
  const view = new PropLayerView(map, new THREE.Texture(), PROPS_ATLAS);
  const mesh = view.root.children[0] as THREE.Mesh;
  const pos = mesh.geometry.getAttribute('position');
  const corners = [0, 1, 2, 3].map((i) => worldOffsetToArtPixels(pos.getX(i), pos.getY(i), pos.getZ(i)));
  view.dispose();
  return corners;
}

const close = (a: number, b: number, eps: number, msg: string) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);

describe('bench sprites in all four directions', () => {
  for (const rot of [0, 90, 180, 270] as const) {
    it(`rot ${rot}: drawn 1:1 (no stretch), on whole art pixels, standing on its footprint`, () => {
      const def = PROP_DEFS['bench']!;
      const r = resolveProp(def, rot)!;
      const spr = propSprite(r.sprite)!;
      const [bl, br, tr, tl] = benchQuad(rot, 25.3, 27.1);

      // Vertex positions are float32, so allow ~0.001 px of rounding.
      // 1. Same size on screen as the sprite (scale 1): no stretching or squashing.
      close(br!.px - bl!.px, spr.width, 1e-3, 'width');
      close(tl!.py - bl!.py, spr.height, 1e-3, 'height');
      // 2. Upright and unskewed: left/right edges vertical, top/bottom horizontal.
      close(bl!.px, tl!.px, 1e-3, 'left edge vertical');
      close(bl!.py, br!.py, 1e-3, 'bottom edge horizontal');
      // 3. Pixel-perfect: every corner on an integer art pixel.
      for (const c of [bl!, br!, tr!, tl!]) {
        close(c.px, Math.round(c.px), 1e-3, 'x on pixel grid');
        close(c.py, Math.round(c.py), 1e-3, 'y on pixel grid');
      }
      // 4. Base sits on the footprint's front (lowest) corner, ±0.5 px snapping.
      const [fx, fz] = r.footprint;
      const front = worldOffsetToArtPixels(25.3 + fx / 2, 0, 27.1 + fz / 2);
      close(bl!.py, front.py, 0.5 + 1e-3, 'base on footprint front corner');
      // 5. Horizontally centred on the footprint centre (±1 px for odd widths + snapping).
      const centre = worldOffsetToArtPixels(25.3, 0, 27.1);
      close((bl!.px + br!.px) / 2, centre.px, 1 + 1e-3, 'centred on footprint');
    });
  }

  it('all four views are the same bench: widths and heights within a few pixels', () => {
    const sizes = (['bench-r0', 'bench-r90', 'bench-r180', 'bench-r270'] as const).map((k) => propSprite(k)!);
    const ws = sizes.map((s) => s.width);
    const hs = sizes.map((s) => s.height);
    assert.ok(Math.max(...ws) - Math.min(...ws) <= 4, `widths ${ws}`);
    // Back views are lower because the seat hides behind the backrest; that is real, not a scale error.
    assert.ok(Math.max(...hs) - Math.min(...hs) <= 16, `heights ${hs}`);
  });
});
