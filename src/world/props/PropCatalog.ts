import { CONCEPT_PROPS } from '../../assets/conceptProps.generated';

/**
 * World-prop definitions: how a picture from the props atlas becomes an object
 * in the world. Pure data; rendering, collision and sorting all read it, so a
 * new asset is added by writing one entry — nothing is special-cased per prop.
 *
 * Per asset:
 * - `sprite` / `rotations`: atlas pictures for each view (camera never rotates).
 * - `scale`: integer art pixels per source pixel (world scale; integers keep pixels square).
 * - `footprint`: ground area in metres [x, z] at rotation 0. The sprite stands on it
 *   and depth sorting uses its two camera-facing edges.
 * - `anchorPx`: optional fine-tune of where the drawn base sits, in sprite pixels
 *   [right, down] (floor anchor).
 * - `collider`: collision shape in world units, independent of the PNG's
 *   transparent edges. Defaults to a box equal to the footprint when `solid`.
 * - `solid`: false = walk-through (no collider at all).
 * - `depth`: 'footprint' (default) sorts against the footprint's front faces;
 *   'flat' is a ground decal drawn under everything (e.g. a manhole cover).
 *
 * These use CONCEPT art as placeholder world props until final props are drawn.
 */

/**
 * Placement rotation in degrees. The camera never rotates, so a rotated prop is
 * simply a different picture of it. For a bench (front = seat side):
 *   0   → front faces +Z (screen down-left)
 *   90  → front faces +X (screen down-right)
 *   180 → front faces −Z (screen up-right, back towards the camera)
 *   270 → front faces −X (screen up-left, back towards the camera)
 */
export type PropRotation = 0 | 90 | 180 | 270;

/** Collision shape in metres, at rotation 0, relative to the footprint centre. */
export type ColliderSpec =
  | { shape: 'box'; size?: [number, number]; offset?: [number, number] }
  | { shape: 'circle'; radius: number; offset?: [number, number] }
  | { shape: 'none' };

export type DepthMode = 'footprint' | 'flat';

export interface PropDef {
  /** Key of the region in the props atlas for rotation 0. */
  sprite: string;
  /** Sprites for other rotations. Missing rotations are not allowed on placements. */
  rotations?: Partial<Record<Exclude<PropRotation, 0>, string>>;
  name: string;
  scale: 1 | 2 | 3;
  footprint: [number, number];
  solid: boolean;
  collider?: ColliderSpec;
  depth?: DepthMode;
  anchorPx?: [number, number];
}

interface DefOpts {
  scale?: 1 | 2 | 3;
  solid?: boolean;
  collider?: ColliderSpec;
  depth?: DepthMode;
  anchorPx?: [number, number];
}

const def = (id: string, name: string, footprint: [number, number], opts: DefOpts = {}) =>
  [id, { sprite: id, name, scale: opts.scale ?? 1, footprint, solid: opts.solid ?? true, ...opts }] as const;

/** Every object from props sheet v2. Sheet scale is consistent, so most props use scale 1. */
export const PROP_DEFS: Record<string, PropDef> = Object.fromEntries([
  // Street furniture
  [
    'bench',
    {
      sprite: 'bench-r0',
      rotations: { 90: 'bench-r90', 180: 'bench-r180', 270: 'bench-r270' },
      name: 'Penkki (4 suuntaa)',
      scale: 1,
      // Matches the drawn base: sprite width 78 px ≈ (1.7 + 0.75) × 32 px.
      footprint: [1.7, 0.75],
      solid: true,
    },
  ] as const,
  def('bench-simple', 'Penkki (arkki v2)', [1.6, 0.7]),
  def('trash-bin', 'Roskis', [0.7, 0.7]),
  def('dumpster', 'Jäteastia', [1.4, 0.8]),
  def('street-lamp', 'Katulamppu', [0.3, 0.3], { collider: { shape: 'circle', radius: 0.14 } }),
  def('hydrant', 'Paloposti', [0.4, 0.4], { collider: { shape: 'circle', radius: 0.18 } }),
  def('manhole', 'Kaivonkansi', [1.0, 1.0], { solid: false, depth: 'flat' }),
  // Shops and fun
  def('arcade', 'Pelikone', [0.9, 0.8]),
  def('vending', 'Juoma-automaatti', [0.9, 0.7]),
  def('atm', 'Pankkiautomaatti', [0.8, 0.7]),
  def('phone-booth', 'Puhelinkoppi', [0.8, 0.8]),
  // Plants
  def('hedge-planter', 'Pensaslaatikko', [1.4, 0.6]),
  def('palm-pot', 'Palmu ruukussa', [0.7, 0.7]),
  def('cypress-pot', 'Sypressi ruukussa', [0.6, 0.6]),
  def('bush-planter', 'Pensasruukku', [0.9, 0.8]),
  def('tree-pot', 'Puu ruukussa', [0.8, 0.8]),
  // Fences and traffic
  def('iron-fence', 'Rautaaita', [1.7, 0.2]),
  def('chain-fence', 'Verkkoaita', [1.8, 0.2]),
  def('guardrail', 'Kaide', [1.8, 0.2]),
  def('barrier-small', 'Betoniesteen pätkä', [0.5, 1.0]),
  def('barrier', 'Betonieste', [0.5, 1.3]),
  def('bollard-red', 'Pollari (puna-valk.)', [0.3, 0.3], { collider: { shape: 'circle', radius: 0.15 } }),
  def('bollard-yellow', 'Pollari (kelta-musta)', [0.3, 0.3], { collider: { shape: 'circle', radius: 0.15 } }),
  def('cone', 'Liikennekartio', [0.6, 0.6], { solid: false }),
  def('traffic-light', 'Liikennevalo', [0.3, 0.3]),
  // Signs
  def('sign-bar', 'Neonkyltti BAR', [0.4, 0.3]),
  def('sign-ramen', 'Neonkyltti ramen', [0.4, 0.3]),
  def('sign-hotel', 'Neonkyltti hotelli', [0.4, 0.3]),
  def('sign-arrow', 'Suuntanuoli', [0.3, 0.3]),
  def('sign-no-entry', 'Kielletty ajosuunta', [0.3, 0.3]),
  // Tech
  def('cctv', 'Valvontakamera', [0.3, 0.3]),
  def('utility-cabinet', 'Sähkökaappi', [0.8, 0.6]),
  def('ac-unit', 'Ilmalämpöpumppu', [1.0, 0.6]),
  def('radiator', 'Lämpöpatteri', [0.9, 0.4]),
  def('pipe-valve', 'Putki ja venttiili', [0.4, 0.4]),
  def('power-box-dark', 'Jakokaappi (tumma)', [0.6, 0.5]),
  def('power-box-green', 'Jakokaappi (vihreä)', [0.8, 0.6]),
  // Cargo
  def('crate', 'Puulaatikko', [0.9, 0.9]),
  def('cardboard-box', 'Pahvilaatikko', [0.9, 0.8]),
  def('pallet-stack', 'Lavapino', [1.1, 1.0]),
  def('pallet-blue', 'Muovilava', [1.1, 1.0]),
  def('barrel-red', 'Tynnyri (punainen)', [0.6, 0.6]),
  def('barrel-blue', 'Tynnyri (sininen)', [0.6, 0.6]),
  def('barrel-orange', 'Tynnyri (oranssi)', [0.6, 0.6]),
  def('ibc-tank', 'IBC-säiliö', [0.9, 0.9]),
  def('toolbox', 'Työkalulaatikko', [0.9, 0.7]),
  def('ammo-box', 'Sotilaslaatikko', [1.0, 0.8]),
  def('flight-case', 'Kuljetuslaatikko', [1.1, 1.0]),
  // Vehicles
  def('scooter', 'Skootteri', [0.6, 1.4]),
  def('bicycle', 'Polkupyörä', [0.5, 1.4], { solid: false }),
  def('kick-scooter', 'Potkulauta', [0.4, 0.9], { solid: false }),
  def('shopping-cart', 'Ostoskärry', [0.6, 0.9]),
  // Market (drawn small on the sheet → scale 2)
  def('food-cart', 'Ruokakärry', [1.6, 1.4], { scale: 2 }),
  def('market-stall', 'Myyntikoju', [1.8, 1.6], { scale: 2 }),
  def('food-stand', 'Ruokakoju', [2.0, 1.7], { scale: 2 }),
  def('kiosk', 'Kioski', [2.4, 1.9], { scale: 2 }),
  def('ice-freezer', 'Jäätelöpakastin', [1.0, 0.8]),
  // Roof and construction
  def('ac-unit-2', 'Ulkoyksikkö', [0.9, 0.8]),
  def('ac-unit-3', 'Ulkoyksikkö (iso)', [0.9, 0.8]),
  def('vent-box', 'Ilmanvaihtolaatikko', [0.8, 0.7]),
  def('duct', 'Ilmastointikanava', [1.0, 0.8]),
  def('roof-box', 'Kattolaite', [0.8, 0.7]),
  def('roof-turbine', 'Kattotuuletin', [0.7, 0.7]),
  def('pipes', 'Putkinippu', [1.2, 0.8]),
  def('cable-spool', 'Kaapelikela', [0.8, 0.8]),
  def('ladder', 'Tikkaat', [0.8, 0.4]),
  def('scaffold', 'Rakennusteline', [1.2, 0.9]),
  def('planks', 'Lankkupino', [0.6, 1.0]),
]);

export interface PropIssue {
  message: string;
}

export function validatePropDefs(defs: Record<string, PropDef> = PROP_DEFS): PropIssue[] {
  const keys = new Set(CONCEPT_PROPS.map((p) => p.key));
  const issues: PropIssue[] = [];
  for (const [id, d] of Object.entries(defs)) {
    if (!keys.has(d.sprite)) issues.push({ message: `prop ${id}: sprite "${d.sprite}" not in props atlas` });
    for (const [rot, key] of Object.entries(d.rotations ?? {}))
      if (!keys.has(key)) issues.push({ message: `prop ${id}: rotation ${rot} sprite "${key}" not in props atlas` });
    if (!(d.footprint[0] > 0 && d.footprint[1] > 0)) issues.push({ message: `prop ${id}: footprint must be positive` });
  }
  return issues;
}

export function propSprite(key: string) {
  return CONCEPT_PROPS.find((p) => p.key === key);
}

/**
 * Rotates a local (rotation 0) ground vector into the world. Rotation 0 has the
 * prop's front facing +Z; 90 turns it to +X, 180 to −Z, 270 to −X.
 */
export function rotateLocal(v: [number, number], rot: PropRotation): [number, number] {
  const [x, z] = v;
  switch (rot) {
    case 90:
      return [z, -x];
    case 180:
      return [-x, -z];
    case 270:
      return [-z, x];
    default:
      return [x, z];
  }
}

/** Sprite and world footprint of a prop at a given rotation (90/270 swap the footprint axes). */
export function resolveProp(def: PropDef, rot: PropRotation = 0): { sprite: string; footprint: [number, number] } | null {
  const sprite = rot === 0 ? def.sprite : def.rotations?.[rot];
  if (!sprite) return null;
  const [fx, fz] = def.footprint;
  return { sprite, footprint: rot === 90 || rot === 270 ? [fz, fx] : [fx, fz] };
}

export type WorldCollider =
  | { shape: 'box'; minX: number; minZ: number; maxX: number; maxZ: number }
  | { shape: 'circle'; x: number; z: number; r: number };

/** World-space collider of a placed prop, or null when it is walk-through. */
export function resolveCollider(def: PropDef, x: number, z: number, rot: PropRotation = 0): WorldCollider | null {
  if (!def.solid) return null;
  const spec: ColliderSpec = def.collider ?? { shape: 'box' };
  if (spec.shape === 'none') return null;
  const [ox, oz] = rotateLocal(spec.offset ?? [0, 0], rot);
  if (spec.shape === 'circle') return { shape: 'circle', x: x + ox, z: z + oz, r: spec.radius };
  const size = spec.size ?? def.footprint;
  const [sx, sz] = rot === 90 || rot === 270 ? [size[1], size[0]] : size;
  return { shape: 'box', minX: x + ox - sx / 2, minZ: z + oz - sz / 2, maxX: x + ox + sx / 2, maxZ: z + oz + sz / 2 };
}
