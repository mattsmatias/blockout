import type { AssetManager } from '../assets/AssetManager';
import { CONCEPT_PROPS, PROPS_ATLAS } from '../assets/conceptProps.generated';
import type { AvatarDefinition } from '../avatar/AvatarDefinition';
import { ITEMS, type ItemDefinition } from '../items/ItemCatalog';

/**
 * Dev-only catalogue of everything imported from the concept sheet: 12 avatars,
 * weapons, consumables and crates, with their honest production status.
 * Opened from the dev panel. Never shown to regular players.
 */
export class ConceptCatalog {
  readonly el: HTMLDivElement;

  constructor(
    assets: AssetManager,
    avatars: AvatarDefinition[],
    overlay: HTMLElement,
    private readonly onPickAvatar: (id: string) => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'catalog hidden';
    this.el.dataset.ui = '1';

    const img = (id: string, alt: string) => {
      try {
        return `<img src="${assets.resolveUrl(id)}" alt="${alt}" loading="lazy" />`;
      } catch {
        return `<div class="missing">puuttuu</div>`;
      }
    };
    const atlasStatus = (a: AvatarDefinition) => {
      const e = assets.entry(a.spriteAtlas);
      return e?.status === 'approved' ? '<em class="ok">sprite OK</em>' : `<em class="warn">sprite: M${e?.milestone ?? '?'}</em>`;
    };
    const itemCard = (it: ItemDefinition) =>
      `<div class="card">${img(it.icon, it.name)}<b>${it.name}</b><small>${it.kind}${it.rarity ? ' · ' + it.rarity : ''}</small></div>`;
    const section = (title: string, list: ItemDefinition[]) =>
      `<h3>${title} <span>${list.length}</span></h3><div class="grid">${list.map(itemCard).join('')}</div>`;

    let atlasUrl = '';
    try {
      atlasUrl = assets.resolveUrl('concept.props.atlas');
    } catch {
      /* reported via assets.errors */
    }
    /** Draws one atlas region at 2× (integer scale keeps pixels crisp). */
    const propImg = (p: (typeof CONCEPT_PROPS)[number]) => {
      const [x, y, w, h] = p.atlas as [number, number, number, number];
      const k = w * 2 <= 180 && h * 2 <= 200 ? 2 : 1; // uniform 2× except oversized scenes
      return `<span class="atlas-sprite" role="img" aria-label="${p.label}" style="width:${w * k}px;height:${h * k}px;background-image:url('${atlasUrl}');background-size:${PROPS_ATLAS.width * k}px ${PROPS_ATLAS.height * k}px;background-position:-${x * k}px -${y * k}px"></span>`;
    };
    const propSections = () => {
      const cats = new Map<string, typeof CONCEPT_PROPS>();
      for (const p of CONCEPT_PROPS) {
        const list = cats.get(p.categoryLabel) ?? [];
        list.push(p);
        cats.set(p.categoryLabel, list);
      }
      return [...cats]
        .map(
          ([label, list]) =>
            `<h4>${label} <span>${list.length}</span></h4><div class="grid props">${list
              .map((p) => `<div class="card prop" title="${p.key} · ${p.width}×${p.height}px">${propImg(p)}</div>`)
              .join('')}</div>`,
        )
        .join('');
    };

    this.el.innerHTML = `
      <div class="catalog-head">
        <strong>Assetit — konseptiarkista</strong>
        <button data-act="close" aria-label="Sulje">×</button>
      </div>
      <p class="catalog-note">Kuvat on leikattu konseptiarkista. Ne kelpaavat UI-ikoneiksi ja esikatseluun, mutta eivät
      pelimaailman hahmoiksi: niistä puuttuvat 8 suuntaa, animaatioruudut ja yhteinen jalka-ankkuri.
      Pelaaja näkyy kartalla dev-merkkinä kunnes avatarin spriteatlas on tehty ja hyväksytty.</p>
      <h3>Avatarit <span>${avatars.length}</span></h3>
      <div class="grid avatars">${avatars
        .map(
          (a) => `<button class="card" data-avatar="${a.id}">${img(a.conceptPortrait, a.displayName)}<b>${a.displayName}</b><small>${a.summary}</small>${atlasStatus(a)}</button>`,
        )
        .join('')}</div>
      ${section('Aseet', ITEMS.filter((i) => i.category === 'weapon'))}
      ${section('Tarvikkeet', ITEMS.filter((i) => i.category === 'consumable'))}
      ${section('Loot cratet', ITEMS.filter((i) => i.category === 'crate'))}
      <h3>Ympäristö <span>${CONCEPT_PROPS.length}</span></h3>
      <p class="catalog-note">Ympäristöarkista v2. Nämä ovat käytössä pelimaailmassa testikentällä.</p>
      ${propSections()}`;

    this.el.querySelector('[data-act="close"]')!.addEventListener('click', () => this.toggle(false));
    this.el.querySelectorAll<HTMLButtonElement>('[data-avatar]').forEach((b) =>
      b.addEventListener('click', () => {
        this.onPickAvatar(b.dataset.avatar!);
        this.markSelected(b.dataset.avatar!);
      }),
    );
    overlay.appendChild(this.el);
  }

  markSelected(id: string): void {
    this.el.querySelectorAll<HTMLElement>('[data-avatar]').forEach((b) => b.classList.toggle('on', b.dataset.avatar === id));
  }

  toggle(force?: boolean): void {
    this.el.classList.toggle('hidden', force === undefined ? undefined : !force);
  }

  dispose(): void {
    this.el.remove();
  }
}
