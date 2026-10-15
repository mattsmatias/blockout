import type { MapDefinition } from '../../MapDefinition';

/**
 * Milestone 1 foundation test map.
 *
 * NOT Neon City. This is a 32×32 engine test ground used to verify the loop,
 * camera, input, collision and pixel rendering before any real art exists.
 * Grey blocks are collision/scale test volumes, not building designs.
 */

const W = 32;
const D = 32;

function buildTerrain(): string[] {
  const rows: string[] = [];
  for (let z = 0; z < D; z++) {
    let row = '';
    for (let x = 0; x < W; x++) {
      const roadX = x >= 14 && x <= 17;
      const roadZ = z >= 14 && z <= 17;
      const walkX = x === 12 || x === 13 || x === 18 || x === 19;
      const walkZ = z === 12 || z === 13 || z === 18 || z === 19;
      let c = '.';
      if (roadX || roadZ) c = 'R';
      else if (walkX || walkZ) c = 'S';
      else if (x < 12 && z < 12) c = 'P';
      else if (x > 19 && z > 19) c = 'G';
      else if (x < 3 || z < 3 || x > 28 || z > 28) c = 'G';
      row += c;
    }
    rows.push(row);
  }
  return rows;
}

export const DEV_TEST_MAP: MapDefinition = {
  id: 'dev-test',
  name: 'Foundation Test Ground',
  theme: 'dev',
  width: W,
  depth: D,
  tileSize: 1,
  visualMargin: 24,
  chunkSize: 16,
  terrain: {
    rows: buildTerrain(),
    legend: { '.': 'ground', R: 'road', S: 'sidewalk', G: 'grass', P: 'plaza' },
  },
  obstacles: [
    // Scale references: 1, 2 and 4 m tall volumes.
    { id: 'block-a', x: 4, z: 4, width: 4, depth: 3, height: 3, look: 'block' },
    { id: 'block-b', x: 22, z: 4, width: 5, depth: 6, height: 6, look: 'block' },
    { id: 'block-c', x: 4, z: 22, width: 6, depth: 4, height: 2, look: 'block' },
    // Wall with a one-tile gap: tests squeezing through openings.
    { id: 'wall-1', x: 21, z: 22, width: 3, depth: 0.4, height: 2.5, look: 'block' },
    { id: 'wall-2', x: 25, z: 22, width: 3, depth: 0.4, height: 2.5, look: 'block' },
    // Pillars: tests sliding around convex corners without snagging.
    { id: 'pillar-1', x: 9, z: 15, width: 0.6, depth: 0.6, height: 2.5, look: 'pillar' },
    { id: 'pillar-2', x: 22, z: 15, width: 0.6, depth: 0.6, height: 2.5, look: 'pillar' },
    { id: 'crate-1', x: 6, z: 9, width: 1, depth: 1, height: 1, look: 'crate' },
    { id: 'crate-2', x: 7, z: 9, width: 1, depth: 1, height: 1, look: 'crate' },
    { id: 'crate-3', x: 6, z: 10, width: 1, depth: 1, height: 1, look: 'crate' },
  ],
  // Props are added one at a time (ids from world/props/PropCatalog.ts), e.g.
  // { prop: 'bench', x: 13.2, z: 7.5 },
  props: [
    // Bench test in the park: one per rotation, all seats facing the middle.
    { prop: 'bench', x: 25.5, z: 25.4, rot: 0 },
    { prop: 'bench', x: 23.8, z: 27.2, rot: 90 },
    { prop: 'bench', x: 25.5, z: 29, rot: 180 },
    { prop: 'bench', x: 27.2, z: 27.2, rot: 270 },
  ],
  spawnPoints: [{ id: 'spawn-center', x: 16, z: 16 }],
  devPoints: [
    { id: 'tp-center', x: 16, z: 16, label: 'Keskusta' },
    { id: 'tp-corner-nw', x: 1.5, z: 1.5, label: 'Kulma NW' },
    { id: 'tp-corner-se', x: 30.5, z: 30.5, label: 'Kulma SE' },
    { id: 'tp-wall-gap', x: 24.5, z: 24, label: 'Seinän aukko' },
    { id: 'tp-crates', x: 8.5, z: 11.5, label: 'Laatikot' },
    { id: 'tp-plaza', x: 6.5, z: 8.2, label: 'Aukio' },
    { id: 'tp-market', x: 6.5, z: 18.8, label: 'Tori' },
    { id: 'tp-park', x: 25.5, z: 27.2, label: 'Puisto (penkit)' },
  ],
  lighting: {
    ambientSky: 0x8a9cff,
    ambientGround: 0x2a1f3d,
    ambientIntensity: 1.1,
    sunColor: 0xfff1dc,
    sunIntensity: 1.6,
    sunFrom: { x: -0.6, y: 1.4, z: 0.35 },
  },
  assetRefs: [],
};
