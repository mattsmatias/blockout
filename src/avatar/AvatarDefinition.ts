/**
 * Data-driven avatar identity. Every avatar uses the same engine path; nothing
 * here is code, so adding the 13th avatar is a data change only.
 *
 * Visual layers (hair, headwear, upper body…) are named, not drawn: the
 * AvatarRenderer (Milestone 2) maps them to sprite-atlas regions. Colours are
 * recorded so previews, UI and future recolour variants stay consistent.
 */

export const DIRECTIONS_8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type Direction8 = (typeof DIRECTIONS_8)[number];

export const CORE_ANIMATIONS = ['idle', 'walk', 'run'] as const;
export const LATER_ANIMATIONS = ['aim', 'shoot', 'reload', 'crouch', 'jump', 'hit', 'knockdown', 'death', 'emote'] as const;
export type AnimationName = (typeof CORE_ANIMATIONS)[number] | (typeof LATER_ANIMATIONS)[number];

export interface AvatarPart {
  /** Style key, e.g. "cap-flat", "hoodie-zip". Mapped to atlas regions in M2. */
  style: string;
  /** Main colour as hex (#rrggbb). */
  color: string;
  accent?: string;
}

export interface CollisionProfile {
  /** Circle radius in world units. Same for every avatar — visuals must never change hitboxes. */
  radius: number;
  /** Visual height in world units (camera framing, future hit volumes). */
  height: number;
}

export interface AvatarDefinition {
  id: string;
  displayName: string;
  /** Shared body rig. All 12 use the same one so animations are reusable. */
  baseModel: 'blocky-v1';
  skinTone: string;
  face: string;
  hairstyle: string;
  hairColor: string;
  headwear: AvatarPart | null;
  upperBody: AvatarPart;
  lowerBody: AvatarPart;
  shoes: AvatarPart;
  accessories: AvatarPart[];
  /** Manifest id of the in-game sprite atlas. Must be an approved spriteAtlas to render in-world. */
  spriteAtlas: string;
  animationSet: 'humanoid-v1';
  /** Uniform scale. 1 for everyone — avatars may not differ in size. */
  visualScale: 1;
  collisionProfile: CollisionProfile;
  /** Concept-art portrait (manifest id). UI/preview only. */
  conceptPortrait: string;
  /** One-line identity summary used in tools. */
  summary: string;
}

export interface AvatarIssue {
  id: string;
  message: string;
}

const HEX = /^#[0-9a-f]{6}$/i;

export function validateAvatar(a: AvatarDefinition, assetIds: ReadonlySet<string>): AvatarIssue[] {
  const out: AvatarIssue[] = [];
  const bad = (message: string) => out.push({ id: a.id, message });
  if (!/^[a-z][a-z0-9-]*$/.test(a.id)) bad('id must be lowercase kebab-case');
  if (!a.displayName.trim()) bad('displayName is empty');
  for (const [k, v] of Object.entries({ skinTone: a.skinTone, hairColor: a.hairColor })) if (!HEX.test(v)) bad(`${k} must be #rrggbb`);
  const parts = [a.headwear, a.upperBody, a.lowerBody, a.shoes, ...a.accessories].filter(Boolean) as AvatarPart[];
  for (const p of parts) {
    if (!HEX.test(p.color)) bad(`part ${p.style} colour must be #rrggbb`);
    if (p.accent && !HEX.test(p.accent)) bad(`part ${p.style} accent must be #rrggbb`);
  }
  if (a.visualScale !== 1) bad('visualScale must be 1 (all avatars share one scale)');
  if (!assetIds.has(a.spriteAtlas)) bad(`spriteAtlas "${a.spriteAtlas}" is not in the asset manifest`);
  if (!assetIds.has(a.conceptPortrait)) bad(`conceptPortrait "${a.conceptPortrait}" is not in the asset manifest`);
  return out;
}
