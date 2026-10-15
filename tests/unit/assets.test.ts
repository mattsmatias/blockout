import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AssetError, AssetManager } from '../../src/assets/AssetManager';
import { GAME_MANIFEST, validateManifest, type AssetManifest } from '../../src/assets/AssetManifest';

const manifest: AssetManifest = {
  version: 1,
  entries: [
    { id: 'tex.a', type: 'texture', url: 'assets/a.png', status: 'approved', pixelArt: true },
    { id: 'tex.broken', type: 'texture', url: 'assets/broken.png', status: 'approved', pixelArt: true },
    { id: 'avatar.x', type: 'spriteAtlas', url: 'assets/x.json', status: 'pending', milestone: 2 },
  ],
};

function makeManager() {
  const disposed: string[] = [];
  const am = new AssetManager(manifest, '/');
  am.registerLoader('texture', async (e) => {
    await new Promise((r) => setTimeout(r, 5));
    if (e.id === 'tex.broken') throw new Error('404');
    return { value: { id: e.id }, dispose: () => disposed.push(e.id) };
  });
  return { am, disposed };
}

describe('AssetManager', () => {
  it('concurrent requests share one load (no duplicate fetch)', async () => {
    const { am } = makeManager();
    const [a, b, c] = await Promise.all([am.acquire('tex.a'), am.acquire('tex.a'), am.acquire('tex.a')]);
    assert.equal(am.loadCount, 1);
    assert.equal(a, b);
    assert.equal(b, c);
    assert.equal(am.refCount('tex.a'), 3);
  });

  it('frees the resource only when the last reference is released', async () => {
    const { am, disposed } = makeManager();
    await am.acquire('tex.a');
    await am.acquire('tex.a');
    am.release('tex.a');
    assert.deepEqual(disposed, []);
    am.release('tex.a');
    assert.deepEqual(disposed, ['tex.a']);
    assert.equal(am.loadedIds.length, 0);
  });

  it('reports missing assets loudly — no silent fallback', async () => {
    const { am } = makeManager();
    await assert.rejects(am.acquire('tex.broken'), AssetError);
    await assert.rejects(am.acquire('does.not-exist'), /not declared/);
    assert.equal(am.errors.length, 2);
    assert.equal(am.refCount('tex.broken'), 0);
  });

  it('pending (not yet produced) assets fail with the milestone in the message', async () => {
    const { am } = makeManager();
    await assert.rejects(am.acquire('avatar.x'), /pending.*milestone 2/);
  });

  it('a failed load can be retried (not cached as failure forever)', async () => {
    const { am } = makeManager();
    await assert.rejects(am.acquire('tex.broken'));
    await assert.rejects(am.acquire('tex.broken'));
    assert.equal(am.loadCount, 2);
  });

  it('reports progress for batch loads', async () => {
    const progress: Array<[number, number]> = [];
    const am = new AssetManager(manifest, '/', { onProgress: (l, t) => progress.push([l, t]) });
    am.registerLoader('texture', async () => ({ value: 1 }));
    await am.acquireAll(['tex.a', 'tex.broken']);
    assert.deepEqual(progress, [
      [1, 2],
      [2, 2],
    ]);
  });

  it('disposeAll frees everything', async () => {
    const { am, disposed } = makeManager();
    await am.acquire('tex.a');
    am.disposeAll();
    assert.deepEqual(disposed, ['tex.a']);
  });
});

describe('asset manifest validation', () => {
  it('the shipped game manifest is valid', () => {
    assert.deepEqual(validateManifest(GAME_MANIFEST), []);
  });

  it('catches duplicates, absolute urls, shared urls and missing filtering', () => {
    const issues = validateManifest({
      version: 1,
      entries: [
        { id: 'a.b', type: 'texture', url: 'x.png', status: 'approved', pixelArt: true },
        { id: 'a.b', type: 'texture', url: 'y.png', status: 'approved', pixelArt: true },
        { id: 'c.d', type: 'texture', url: '/abs.png', status: 'approved', pixelArt: true },
        { id: 'e.f', type: 'texture', url: 'x.png', status: 'approved', pixelArt: true },
        { id: 'g.h', type: 'texture', url: 'z.png', status: 'approved' },
      ],
    });
    const msgs = issues.map((i) => `${i.id}:${i.message}`).join('\n');
    assert.match(msgs, /a\.b:duplicate id/);
    assert.match(msgs, /c\.d:url must be a relative/);
    assert.match(msgs, /e\.f:same url/);
    assert.match(msgs, /g\.h:texture must declare pixelArt/);
  });

  it('the Mack atlas is honestly marked pending in milestone 1', () => {
    const mack = GAME_MANIFEST.entries.find((e) => e.id === 'avatar.mack.atlas');
    assert.equal(mack?.status, 'pending');
  });
});
