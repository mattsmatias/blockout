import { GAME_MANIFEST } from '../assets/AssetManifest';
import { validateAvatar, type AvatarDefinition, type AvatarIssue } from './AvatarDefinition';
import { AVATARS } from './avatars';

/** Lookup + validation for avatar definitions. One registry, all avatars, same code path. */
export class AvatarRegistry {
  private readonly byId = new Map<string, AvatarDefinition>();

  constructor(defs: AvatarDefinition[] = AVATARS) {
    for (const d of defs) {
      if (this.byId.has(d.id)) throw new Error(`duplicate avatar id "${d.id}"`);
      this.byId.set(d.id, d);
    }
  }

  get(id: string): AvatarDefinition {
    const d = this.byId.get(id);
    if (!d) throw new Error(`unknown avatar "${id}"`);
    return d;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  all(): AvatarDefinition[] {
    return [...this.byId.values()];
  }

  validate(assetIds: ReadonlySet<string> = new Set(GAME_MANIFEST.entries.map((e) => e.id))): AvatarIssue[] {
    return this.all().flatMap((d) => validateAvatar(d, assetIds));
  }
}
