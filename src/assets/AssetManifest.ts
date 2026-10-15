import { AVATAR_IDS } from '../avatar/avatars';
import { CONCEPT_ASSETS } from './conceptAssets.generated';
import { PROPS_ATLAS } from './conceptProps.generated';

/**
 * Declarative list of every asset the game may load.
 *
 * `status` is honest bookkeeping:
 *  - "approved": final, production-quality asset exists at `url`.
 *  - "pending":  required by a later milestone, not produced yet. Requesting it
 *                raises a visible dev error — it is NEVER silently replaced.
 *  - "concept":  cut from concept art. Allowed for portraits / UI icons / previews,
 *                never as an in-world sprite or animation source.
 *  - "dev":      generated at runtime for development only (never shipped as art).
 */

export type AssetType = 'texture' | 'json' | 'spriteAtlas';
export type AssetStatus = 'approved' | 'pending' | 'concept' | 'dev';

/** One crop produced by tools/extract_concept_sheet.py. */
export interface ConceptAssetInfo {
  id: string;
  group: string;
  key: string;
  label: string;
  url: string;
  width: number;
  height: number;
  sourceBox: number[];
}

/** One prop region in the props atlas, produced by tools/extract_props_sheet.py. */
export interface ConceptPropInfo {
  id: string;
  group: 'props';
  category: string;
  categoryLabel: string;
  key: string;
  label: string;
  /** Individual crop in the repo (source material, not shipped). */
  file: string;
  width: number;
  height: number;
  sourceBox: number[];
  /** [x, y, w, h] inside PROPS_ATLAS. */
  atlas: number[];
}

export interface AssetEntry {
  id: string;
  type: AssetType;
  /** Path relative to the site root, e.g. "assets/avatars/mack/atlas.png". */
  url: string;
  status: AssetStatus;
  /** Pixel-art textures must use nearest filtering. */
  pixelArt?: boolean;
  /** Milestone that introduces this asset, for reporting. */
  milestone?: number;
  note?: string;
}

export interface AssetManifest {
  version: number;
  entries: AssetEntry[];
}

export interface ValidationIssue {
  id: string;
  message: string;
}

export function validateManifest(m: AssetManifest): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  const urls = new Map<string, string>();
  for (const e of m.entries) {
    if (!/^[a-z0-9]+(\.[a-z0-9-]+)+$/.test(e.id)) issues.push({ id: e.id, message: 'id must be dot.separated lowercase' });
    if (seen.has(e.id)) issues.push({ id: e.id, message: 'duplicate id' });
    seen.add(e.id);
    if (e.status !== 'dev') {
      if (!e.url) issues.push({ id: e.id, message: 'missing url' });
      else if (e.url.startsWith('/') || e.url.includes('..') || /^https?:/.test(e.url))
        issues.push({ id: e.id, message: 'url must be a relative path inside public/' });
      const prev = urls.get(e.url);
      if (e.url && prev) issues.push({ id: e.id, message: `same url as "${prev}" (would load twice)` });
      if (e.url) urls.set(e.url, e.id);
    }
    if (e.status === 'concept' && e.type !== 'texture')
      issues.push({ id: e.id, message: 'concept art may only be used as a texture (portrait/icon), not as ' + e.type });
    if (e.type === 'texture' && e.pixelArt === undefined)
      issues.push({ id: e.id, message: 'texture must declare pixelArt filtering' });
  }
  return issues;
}

/** Phase 1 manifest. Avatar and city art are honestly marked as pending. */
export const GAME_MANIFEST: AssetManifest = {
  version: 1,
  entries: [
    ...AVATAR_IDS.map(
      (id): AssetEntry => ({
        id: `avatar.${id}.atlas`,
        type: 'spriteAtlas',
        url: `assets/avatars/${id}/${id}.atlas.json`,
        status: 'pending',
        milestone: id === 'mack' ? 2 : 5,
        note: '8 directions × idle/walk/run, 128×128 frames, shared foot anchor',
      }),
    ),
    {
      id: 'tiles.neon-city.ground',
      type: 'texture',
      url: 'assets/tiles/neon-city/ground.png',
      status: 'pending',
      pixelArt: true,
      milestone: 3,
      note: 'Road, sidewalk, grass, water tiles (64×32 diamonds)',
    },
    {
      id: 'dev.grid',
      type: 'texture',
      url: '',
      status: 'dev',
      pixelArt: true,
      note: 'Procedural debug tile texture',
    },
    ...CONCEPT_ASSETS.map(
      (c): AssetEntry => ({
        id: c.id,
        type: 'texture',
        url: c.url,
        status: 'concept',
        pixelArt: true,
        note: `Concept crop "${c.label}" (${c.width}×${c.height}) — UI/preview only`,
      }),
    ),
    {
      id: 'concept.props.atlas',
      type: 'texture',
      url: PROPS_ATLAS.url,
      status: 'concept',
      pixelArt: true,
      note: `All environment props from the props sheet, packed (${PROPS_ATLAS.width}×${PROPS_ATLAS.height})`,
    },
  ],
};

export function conceptAsset(group: string, key: string): ConceptAssetInfo | undefined {
  return CONCEPT_ASSETS.find((c) => c.group === group && c.key === key);
}
