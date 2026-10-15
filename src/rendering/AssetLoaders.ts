import * as THREE from 'three';
import type { AssetEntry } from '../assets/AssetManifest';
import type { AssetManager, LoadedAsset } from '../assets/AssetManager';

/** three.js / browser loaders plugged into the engine-agnostic AssetManager. */

function configurePixelTexture(t: THREE.Texture, pixelArt: boolean): THREE.Texture {
  t.colorSpace = THREE.SRGBColorSpace;
  if (pixelArt) {
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
  }
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

/** Procedural development textures. Clearly dev-only; never shipped as final art. */
const DEV_TEXTURES: Record<string, () => THREE.Texture> = {
  'dev.grid': () => {
    const size = 16;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, size, size);
    // Subtle 1-px tile border + light speckle so motion is readable on flat colour.
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(0, 0, size, 1);
    g.fillRect(0, 0, 1, size);
    g.fillStyle = 'rgba(255,255,255,0.10)';
    g.fillRect(size - 1, 0, 1, size);
    g.fillRect(0, size - 1, size, 1);
    g.fillStyle = 'rgba(0,0,0,0.07)';
    for (const [x, y] of [[4, 5], [11, 3], [7, 11], [13, 12], [2, 13]] as const) g.fillRect(x, y, 1, 1);
    return new THREE.CanvasTexture(c);
  },
};

async function loadTexture(entry: AssetEntry, baseUrl: string): Promise<LoadedAsset<THREE.Texture>> {
  let tex: THREE.Texture;
  if (entry.status === 'dev') {
    const make = DEV_TEXTURES[entry.id];
    if (!make) throw new Error(`no dev generator for "${entry.id}"`);
    tex = make();
  } else {
    tex = await new THREE.TextureLoader().loadAsync(baseUrl + entry.url).catch(() => {
      throw new Error(`failed to load texture ${entry.url}`);
    });
  }
  configurePixelTexture(tex, entry.pixelArt ?? true);
  tex.name = entry.id;
  return { value: tex, dispose: () => tex.dispose() };
}

async function loadJson(entry: AssetEntry, baseUrl: string): Promise<LoadedAsset<unknown>> {
  const res = await fetch(baseUrl + entry.url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${entry.url}`);
  const ct = res.headers.get('content-type') ?? '';
  // Dev servers answer missing files with index.html (200) — treat that as missing.
  if (ct.includes('text/html')) throw new Error(`${entry.url} not found (got HTML)`);
  return { value: await res.json() };
}

export function registerBrowserLoaders(assets: AssetManager): void {
  assets.registerLoader('texture', loadTexture);
  assets.registerLoader('json', loadJson);
  // Sprite atlases arrive in Milestone 2 with their own validator.
  assets.registerLoader('spriteAtlas', async (e) => {
    throw new Error(`sprite atlas loader not implemented until milestone 2 (${e.id})`);
  });
}
