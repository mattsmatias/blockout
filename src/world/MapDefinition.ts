/**
 * Data-driven map format. A map is pure data: no classes, no three.js.
 * The same definition feeds collision, rendering, spawning and (later) the server.
 */

export type TileKind = 'ground' | 'road' | 'sidewalk' | 'grass' | 'water' | 'plaza';

export interface TileLayer {
  /** One string per row (z), one char per column (x). */
  rows: string[];
  legend: Record<string, TileKind>;
}

export interface ObstacleDef {
  id: string;
  /** Min corner in world units (tile-aligned is recommended but not required). */
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  /** Visual category; rendering decides how it looks. */
  look: 'block' | 'crate' | 'pillar';
}

/** A decorative/solid world prop placed by id from the prop catalogue. */
export interface PropPlacement {
  /** Prop definition id (see world/props/PropCatalog.ts). */
  prop: string;
  /** Footprint centre in world units. */
  x: number;
  z: number;
  /** 0 / 90 / 180 / 270 — see PropRotation in world/props/PropCatalog.ts. Default 0. */
  rot?: 0 | 90 | 180 | 270;
}

export interface PointDef {
  id: string;
  x: number;
  z: number;
  label?: string;
}

export interface LightingDef {
  ambientSky: number;
  ambientGround: number;
  ambientIntensity: number;
  sunColor: number;
  sunIntensity: number;
  /** Direction the sun light travels FROM (world, will be normalised). */
  sunFrom: { x: number; y: number; z: number };
}

export interface MapDefinition {
  id: string;
  name: string;
  theme: string;
  /** Playable size in tiles. Origin is tile (0, 0) at world (0, 0). */
  width: number;
  depth: number;
  /** World units per tile. Fixed at 1 for the whole engine. */
  tileSize: 1;
  /** Decorative border (tiles) rendered outside the playable area so the camera never shows void. */
  visualMargin: number;
  /** Tiles per chunk side. Chunks are the unit of mesh building and future streaming. */
  chunkSize: number;
  terrain: TileLayer;
  obstacles: ObstacleDef[];
  /** Street furniture, vehicles, plants… Rendered as sprites, collision from footprint. */
  props: PropPlacement[];
  spawnPoints: PointDef[];
  /** Dev-only teleport targets (?dev=1). */
  devPoints: PointDef[];
  lighting: LightingDef;
  /** Asset ids from the manifest this map needs. Empty for the dev map. */
  assetRefs: string[];
}

export interface MapIssue {
  message: string;
}

export function validateMap(m: MapDefinition): MapIssue[] {
  const issues: MapIssue[] = [];
  if (m.terrain.rows.length !== m.depth) issues.push({ message: `terrain has ${m.terrain.rows.length} rows, expected ${m.depth}` });
  m.terrain.rows.forEach((row, z) => {
    if (row.length !== m.width) issues.push({ message: `terrain row ${z} has ${row.length} cols, expected ${m.width}` });
    for (const ch of row) if (!(ch in m.terrain.legend)) issues.push({ message: `terrain row ${z}: unknown tile "${ch}"` });
  });
  const ids = new Set<string>();
  for (const o of m.obstacles) {
    if (ids.has(o.id)) issues.push({ message: `duplicate obstacle id ${o.id}` });
    ids.add(o.id);
    if (o.width <= 0 || o.depth <= 0 || o.height <= 0) issues.push({ message: `obstacle ${o.id} has non-positive size` });
    if (o.x < 0 || o.z < 0 || o.x + o.width > m.width || o.z + o.depth > m.depth)
      issues.push({ message: `obstacle ${o.id} is outside the map` });
  }
  const inside = (p: PointDef) =>
    p.x > 0 && p.z > 0 && p.x < m.width && p.z < m.depth;
  for (const p of [...m.spawnPoints, ...m.devPoints]) {
    if (!inside(p)) issues.push({ message: `point ${p.id} is outside the map` });
    for (const o of m.obstacles) {
      if (p.x > o.x && p.x < o.x + o.width && p.z > o.z && p.z < o.z + o.depth)
        issues.push({ message: `point ${p.id} is inside obstacle ${o.id}` });
    }
  }
  if (m.spawnPoints.length === 0) issues.push({ message: 'map has no spawn points' });
  return issues;
}

export function tileAt(m: MapDefinition, tx: number, tz: number): TileKind | null {
  if (tx < 0 || tz < 0 || tx >= m.width || tz >= m.depth) return null;
  const ch = m.terrain.rows[tz]![tx]!;
  return m.terrain.legend[ch] ?? null;
}
