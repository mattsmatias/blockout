/**
 * Item catalogue — DATA ONLY.
 *
 * Lists the weapons, consumables and loot crates from the concept sheet so that
 * names, ids and icons are fixed early. There is intentionally no gameplay here
 * (no damage, ammo, inventory or pickup logic): the weapon/inventory system is a
 * later phase. Gameplay stats will be added next to these entries then.
 */

export type ItemCategory = 'weapon' | 'consumable' | 'crate';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface ItemDefinition {
  id: string;
  name: string;
  category: ItemCategory;
  /** Sub-type for later systems, e.g. 'hitscan', 'throwable', 'deployable'. */
  kind: string;
  /** Concept icon (manifest id). UI/preview only. */
  icon: string;
  rarity?: Rarity;
}

const weapon = (key: string, name: string, kind: string): ItemDefinition => ({
  id: `weapon.${key}`,
  name,
  category: 'weapon',
  kind,
  icon: `concept.weapons.${key}`,
});
const consumable = (key: string, name: string, kind: string): ItemDefinition => ({
  id: `item.${key}`,
  name,
  category: 'consumable',
  kind,
  icon: `concept.items.${key}`,
});
const crate = (rarity: Rarity, name: string): ItemDefinition => ({
  id: `crate.${rarity}`,
  name,
  category: 'crate',
  kind: 'loot-crate',
  icon: `concept.crates.${rarity}`,
  rarity,
});

export const ITEMS: ItemDefinition[] = [
  weapon('pistol', 'Pistol', 'hitscan'),
  weapon('smg', 'SMG', 'hitscan'),
  weapon('shotgun', 'Shotgun', 'spread'),
  weapon('assault-rifle', 'Assault Rifle', 'hitscan'),
  weapon('sniper', 'Sniper', 'hitscan'),
  weapon('lmg', 'LMG', 'hitscan'),
  weapon('rocket-launcher', 'Rocket Launcher', 'projectile'),
  weapon('grenade-launcher', 'Grenade Launcher', 'projectile'),
  weapon('bow', 'Bow', 'projectile'),
  weapon('melee-bat', 'Melee', 'melee'),
  consumable('medkit', 'Medkit', 'heal'),
  consumable('shield', 'Shield', 'armor'),
  consumable('grenade', 'Grenade', 'throwable'),
  consumable('smoke', 'Smoke', 'throwable'),
  consumable('flash', 'Flash', 'throwable'),
  consumable('molotov', 'Molotov', 'throwable'),
  consumable('healing-drink', 'Healing Drink', 'heal'),
  consumable('speed-boost', 'Speed Boost', 'buff'),
  consumable('jump-pad', 'Jump Pad', 'deployable'),
  consumable('trap', 'Trap', 'deployable'),
  crate('common', 'Common Crate'),
  crate('rare', 'Rare Crate'),
  crate('epic', 'Epic Crate'),
  crate('legendary', 'Legendary Crate'),
];

export function validateItems(items: ItemDefinition[], assetIds: ReadonlySet<string>): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    if (seen.has(it.id)) issues.push(`duplicate item id ${it.id}`);
    seen.add(it.id);
    if (!assetIds.has(it.icon)) issues.push(`${it.id}: icon "${it.icon}" missing from manifest`);
  }
  return issues;
}
