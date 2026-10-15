import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { GAME_MANIFEST, validateManifest } from '../../src/assets/AssetManifest';
import { CONCEPT_ASSETS } from '../../src/assets/conceptAssets.generated';
import { CONCEPT_PROPS, PROPS_ATLAS } from '../../src/assets/conceptProps.generated';
import { validateAvatar } from '../../src/avatar/AvatarDefinition';
import { AvatarRegistry } from '../../src/avatar/AvatarRegistry';
import { AVATARS } from '../../src/avatar/avatars';
import { PLAYER } from '../../src/core/Config';
import { ITEMS, validateItems } from '../../src/items/ItemCatalog';

const ids = new Set(GAME_MANIFEST.entries.map((e) => e.id));
const EXPECTED = ['mack', 'nova', 'kai', 'zoe', 'river', 'leo', 'pixel', 'sage', 'knox', 'luna', 'axel', 'jay'];

describe('avatars', () => {
  it('all 12 main avatars exist in the specified order', () => {
    assert.deepEqual(
      AVATARS.map((a) => a.id),
      EXPECTED,
    );
  });

  it('every avatar definition is valid', () => {
    assert.deepEqual(new AvatarRegistry().validate(), []);
  });

  it('all avatars share one base model, animation set, scale and collision profile', () => {
    for (const a of AVATARS) {
      assert.equal(a.baseModel, 'blocky-v1');
      assert.equal(a.animationSet, 'humanoid-v1');
      assert.equal(a.visualScale, 1);
      assert.equal(a.collisionProfile.radius, PLAYER.RADIUS);
    }
  });

  it('in-game sprite atlases are honestly pending; Mack first (M2), others after approval (M5)', () => {
    for (const a of AVATARS) {
      const e = GAME_MANIFEST.entries.find((x) => x.id === a.spriteAtlas)!;
      assert.equal(e.status, 'pending');
      assert.equal(e.milestone, a.id === 'mack' ? 2 : 5);
    }
  });

  it('validation catches bad data', () => {
    const bad = { ...AVATARS[0]!, id: 'Bad Id', skinTone: 'red', spriteAtlas: 'nope', visualScale: 2 as 1 };
    const msgs = validateAvatar(bad, ids).map((i) => i.message).join('\n');
    assert.match(msgs, /kebab-case/);
    assert.match(msgs, /skinTone/);
    assert.match(msgs, /visualScale/);
    assert.match(msgs, /spriteAtlas "nope"/);
  });

  it('registry rejects duplicate ids and unknown lookups', () => {
    assert.throws(() => new AvatarRegistry([AVATARS[0]!, AVATARS[0]!]), /duplicate/);
    assert.throws(() => new AvatarRegistry().get('ghost'), /unknown avatar/);
  });
});

describe('item catalogue (data only)', () => {
  it('10 weapons, 10 consumables, 4 crates', () => {
    assert.equal(ITEMS.filter((i) => i.category === 'weapon').length, 10);
    assert.equal(ITEMS.filter((i) => i.category === 'consumable').length, 10);
    assert.equal(ITEMS.filter((i) => i.category === 'crate').length, 4);
  });

  it('every item has a declared icon and a unique id', () => {
    assert.deepEqual(validateItems(ITEMS, ids), []);
  });
});

describe('concept assets', () => {
  it('manifest stays valid with concept entries', () => {
    assert.deepEqual(validateManifest(GAME_MANIFEST), []);
  });

  it('every concept crop file exists on disk and matches its recorded size', () => {
    for (const c of CONCEPT_ASSETS) {
      const file = path.join('public', c.url);
      assert.ok(fs.existsSync(file), `missing ${file}`);
      const buf = fs.readFileSync(file);
      // PNG IHDR: width/height big-endian at bytes 16..23
      assert.equal(buf.readUInt32BE(16), c.width, `${c.id} width`);
      assert.equal(buf.readUInt32BE(20), c.height, `${c.id} height`);
    }
  });

  it('props atlas exists, matches its size, and every region fits inside without overlap', () => {
    const buf = fs.readFileSync(path.join('public', PROPS_ATLAS.url));
    assert.equal(buf.readUInt32BE(16), PROPS_ATLAS.width);
    assert.equal(buf.readUInt32BE(20), PROPS_ATLAS.height);
    const rects = CONCEPT_PROPS.map((p) => p.atlas as [number, number, number, number]);
    for (const [x, y, w, h] of rects) {
      assert.ok(x >= 0 && y >= 0 && x + w <= PROPS_ATLAS.width && y + h <= PROPS_ATLAS.height);
    }
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const [ax, ay, aw, ah] = rects[i]!;
        const [bx, by, bw, bh] = rects[j]!;
        assert.ok(ax + aw <= bx || bx + bw <= ax || ay + ah <= by || by + bh <= ay, `overlap ${i}/${j}`);
      }
  });

  it('props atlas has all 67 sheet-v2 objects plus 4 bench rotations, keys unique', () => {
    assert.equal(CONCEPT_PROPS.length, 71);
    assert.equal(new Set(CONCEPT_PROPS.map((p) => p.key)).size, 71);
  });

  it('turned bench views are exact mirrors of the correctly drawn views', () => {
    const by = (k: string) => CONCEPT_PROPS.find((p) => p.key === k)!;
    assert.equal(by('bench-r90').mirrorOf, 'bench-r0');
    assert.equal(by('bench-r270').mirrorOf, 'bench-r180');
    assert.equal(by('bench-r90').width, by('bench-r0').width);
    assert.equal(by('bench-r270').height, by('bench-r180').height);
  });

  it('concept art can never be registered as a sprite atlas', () => {
    const issues = validateManifest({
      version: 1,
      entries: [{ id: 'concept.avatars.fake', type: 'spriteAtlas', url: 'x.json', status: 'concept' }],
    });
    assert.match(issues.map((i) => i.message).join(), /only be used as a texture/);
  });
});
