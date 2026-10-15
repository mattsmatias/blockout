import { PLAYER } from '../core/Config';
import type { AvatarDefinition, AvatarPart } from './AvatarDefinition';

/**
 * The 12 BLOCKOUT main avatars, transcribed from the concept sheet
 * (concept/blockout-asset-sheet-v1.png). Colours are approximate picks from the
 * concept portraits and will be locked when each sprite atlas is approved.
 */

const part = (style: string, color: string, accent?: string): AvatarPart => (accent ? { style, color, accent } : { style, color });

const shared = {
  baseModel: 'blocky-v1',
  animationSet: 'humanoid-v1',
  visualScale: 1,
  collisionProfile: { radius: PLAYER.RADIUS, height: 1.6 },
} as const;

function avatar(
  id: string,
  displayName: string,
  summary: string,
  look: Pick<AvatarDefinition, 'skinTone' | 'face' | 'hairstyle' | 'hairColor' | 'headwear' | 'upperBody' | 'lowerBody' | 'shoes' | 'accessories'>,
): AvatarDefinition {
  return {
    id,
    displayName,
    summary,
    ...shared,
    ...look,
    spriteAtlas: `avatar.${id}.atlas`,
    conceptPortrait: `concept.avatars.${id}`,
  };
}

export const AVATARS: AvatarDefinition[] = [
  avatar('mack', 'Mack', 'Punainen lippis, musta huppari punaisilla hihoilla', {
    skinTone: '#e8b48a', face: 'determined', hairstyle: 'short-under-cap', hairColor: '#6b3a22',
    headwear: part('cap-flat', '#d8232a', '#ffc928'),
    upperBody: part('hoodie-zip', '#1c1c24', '#d8232a'),
    lowerBody: part('joggers', '#1f2230'), shoes: part('sneakers', '#f2f2f2'),
    accessories: [],
  }),
  avatar('nova', 'Nova', 'Pitkät pinkit hiukset, pinkki toppi, farkkushortsit', {
    skinTone: '#f0c19a', face: 'calm', hairstyle: 'long-straight', hairColor: '#ff3fa4',
    headwear: null,
    upperBody: part('crop-top', '#ff7cc2'), lowerBody: part('denim-shorts', '#2d3566'),
    shoes: part('sneakers', '#ff7cc2', '#ffffff'), accessories: [],
  }),
  avatar('kai', 'Kai', 'Vihreä bucket-hattu ja vihreä maastoasu', {
    skinTone: '#d9a074', face: 'neutral', hairstyle: 'short-under-hat', hairColor: '#3a2416',
    headwear: part('bucket-hat', '#34a142', '#ffc928'),
    upperBody: part('hoodie-camo', '#2f8a3b'), lowerBody: part('cargo-shorts', '#2a6a31'),
    shoes: part('sneakers', '#f2f2f2', '#34a142'), accessories: [],
  }),
  avatar('zoe', 'Zoe', 'Vaaleat kiharat nutturalla, vaaleanpunainen verryttelyasu', {
    skinTone: '#f3c9a5', face: 'smirk', hairstyle: 'curly-bun', hairColor: '#f2cf72',
    headwear: null,
    upperBody: part('tracksuit-top', '#ff9fcf'), lowerBody: part('tracksuit-pants', '#ff9fcf'),
    shoes: part('sneakers', '#ffffff', '#ff9fcf'), accessories: [],
  }),
  avatar('river', 'River', 'Violetit hiukset, musta paita, violetit housut', {
    skinTone: '#e9b995', face: 'neutral', hairstyle: 'long-side', hairColor: '#7a35e0',
    headwear: null,
    upperBody: part('tee', '#1d1a2e', '#7a35e0'), lowerBody: part('shorts', '#5a2ab8'),
    shoes: part('sneakers', '#6d3ad8', '#ffffff'), accessories: [part('earring-hoop', '#c9c9d6')],
  }),
  avatar('leo', 'Leo', 'Rastat, oranssi takki', {
    skinTone: '#8a5534', face: 'calm', hairstyle: 'locs', hairColor: '#2b1a12',
    headwear: null,
    upperBody: part('puffer-jacket', '#f28a1e', '#ffffff'), lowerBody: part('joggers', '#1f2230'),
    shoes: part('sneakers', '#f2f2f2'), accessories: [],
  }),
  avatar('pixel', 'Pixel', 'Siniset hiukset ja kuulokkeet, sinivalkoinen huppari', {
    skinTone: '#f0c4a0', face: 'focused', hairstyle: 'bob', hairColor: '#2f8fe8',
    headwear: part('headphones', '#e8eef7', '#ff4d6d'),
    upperBody: part('hoodie-stripe', '#2f8fe8', '#ffffff'), lowerBody: part('shorts', '#2b5fae'),
    shoes: part('sneakers', '#f2f2f2', '#2f8fe8'), accessories: [],
  }),
  avatar('sage', 'Sage', 'Keltaiset piikkihiukset, aurinkolasit, musta-kultainen takki', {
    skinTone: '#efc39c', face: 'cool', hairstyle: 'spiky', hairColor: '#ffd23c',
    headwear: null,
    upperBody: part('bomber', '#1b1b20', '#e6b422'), lowerBody: part('joggers', '#1b1b20'),
    shoes: part('sneakers', '#f2f2f2'), accessories: [part('sunglasses', '#111111')],
  }),
  avatar('knox', 'Knox', 'Musta pipo, kokomusta asu', {
    skinTone: '#e3ae86', face: 'serious', hairstyle: 'short-under-beanie', hairColor: '#1a1a1a',
    headwear: part('beanie', '#1f1f24'),
    upperBody: part('hoodie', '#1f1f24'), lowerBody: part('joggers', '#1f1f24'),
    shoes: part('sneakers', '#d9d9d9'), accessories: [],
  }),
  avatar('luna', 'Luna', 'Violetti kissankorvahuppu, violetti asu', {
    skinTone: '#efc1a0', face: 'calm', hairstyle: 'long-under-hood', hairColor: '#8a3cf0',
    headwear: part('cat-hood', '#9a46f2', '#e6d4ff'),
    upperBody: part('hoodie', '#9a46f2'), lowerBody: part('joggers', '#7a2fd6'),
    shoes: part('sneakers', '#9a46f2', '#ffffff'), accessories: [],
  }),
  avatar('axel', 'Axel', 'Valkoinen lippis punaisella logolla, musta asu', {
    skinTone: '#e6b28c', face: 'neutral', hairstyle: 'short-under-cap', hairColor: '#2b1a12',
    headwear: part('cap-flat', '#f4f4f4', '#d8232a'),
    upperBody: part('hoodie', '#1c1c24'), lowerBody: part('joggers', '#1c1c24'),
    shoes: part('sneakers', '#f2f2f2'), accessories: [],
  }),
  avatar('jay', 'Jay', 'Ruskeat kiharat, silmälasit, vihreä takki', {
    skinTone: '#e8b48a', face: 'friendly', hairstyle: 'curly-short', hairColor: '#7a4524',
    headwear: null,
    upperBody: part('windbreaker', '#7cc83a', '#1c1c24'), lowerBody: part('joggers', '#1c1c24'),
    shoes: part('sneakers', '#f2f2f2'), accessories: [part('glasses', '#111111')],
  }),
];

export const AVATAR_IDS = AVATARS.map((a) => a.id);
