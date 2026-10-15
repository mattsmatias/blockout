import { RENDER } from '../core/Config';
import type { DevFlag } from '../core/EventBus';
import type { Game } from '../core/Game';
import { worldToTile } from '../utils/CoordinateUtils';
import { ConceptCatalog } from './ConceptCatalog';

/**
 * Developer panel. Only constructed when the URL contains ?dev=1, so regular
 * players never get the DOM, listeners or update cost.
 * Toggle visibility with F3 or the ⚙ button.
 */
export class DebugPanel {
  readonly el: HTMLDivElement;
  private readonly stats: HTMLPreElement;
  private readonly assetsEl: HTMLDivElement;
  private readonly avatarEl: HTMLDivElement;
  readonly catalog: ConceptCatalog;
  private timer = 0;
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.code === 'F3') {
      e.preventDefault();
      this.toggle();
    }
  };

  constructor(
    private readonly game: Game,
    overlay: HTMLElement,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'dev-panel';
    this.el.dataset.ui = '1';
    this.el.innerHTML = `
      <div class="dev-head">
        <strong>BLOCKOUT DEV</strong><span class="dev-sub">Milestone 1 · F3</span>
        <button class="dev-x" data-act="hide" aria-label="Piilota">×</button>
      </div>
      <pre class="dev-stats"></pre>
      <div class="dev-section">Avatar</div>
      <div class="dev-avatar"></div>
      <div class="dev-section">Näytä</div>
      <div class="dev-row dev-flags"></div>
      <div class="dev-section">Zoom</div>
      <div class="dev-row dev-zoom"></div>
      <div class="dev-section">Teleport</div>
      <div class="dev-row dev-tp"></div>
      <div class="dev-section">Assetit</div>
      <div class="dev-assets"></div>`;
    this.stats = this.el.querySelector('.dev-stats')!;
    this.assetsEl = this.el.querySelector('.dev-assets')!;
    this.avatarEl = this.el.querySelector('.dev-avatar')!;
    this.catalog = new ConceptCatalog(game.assets, game.avatars.all(), overlay, (id) => {
      game.setPlayerAvatar(id);
      this.refreshAvatar();
      this.refreshAssets();
    });

    const flags: Array<[DevFlag, string]> = [
      ['grid', 'Ruudukko'],
      ['colliders', 'Törmäykset'],
      ['anchors', 'Ankkuri'],
      ['cameraBounds', 'Kamerarajat'],
    ];
    const flagRow = this.el.querySelector('.dev-flags')!;
    for (const [flag, label] of flags) {
      const b = this.button(label, () => {
        const v = !game.getFlag(flag);
        game.events.emit('dev:toggle', { flag, value: v });
        b.classList.toggle('on', v);
      });
      flagRow.appendChild(b);
    }

    const zoomRow = this.el.querySelector('.dev-zoom')!;
    const zoomButtons: HTMLButtonElement[] = [];
    const setZoom = (z: number | null, btn: HTMLButtonElement) => {
      game.setZoomOverride(z);
      zoomButtons.forEach((x) => x.classList.toggle('on', x === btn));
    };
    const auto = this.button('Auto', () => setZoom(null, auto));
    auto.classList.add('on');
    zoomButtons.push(auto);
    zoomRow.appendChild(auto);
    for (const z of RENDER.ZOOM_LEVELS) {
      const b = this.button(`${z}×`, () => setZoom(z, b));
      zoomButtons.push(b);
      zoomRow.appendChild(b);
    }

    const tpRow = this.el.querySelector('.dev-tp')!;
    for (const p of game.world.def.devPoints) {
      tpRow.appendChild(this.button(p.label ?? p.id, () => game.events.emit('dev:teleport', { x: p.x, z: p.z })));
    }

    this.el.querySelector('[data-act="hide"]')!.addEventListener('click', () => this.toggle(false));
    const opener = document.createElement('button');
    opener.className = 'dev-open';
    opener.dataset.ui = '1';
    opener.textContent = '⚙';
    opener.setAttribute('aria-label', 'Dev-paneeli');
    opener.addEventListener('click', () => this.toggle(true));
    overlay.append(this.el, opener);
    window.addEventListener('keydown', this.onKey);
    this.refreshAvatar();
    this.refreshAssets();
    game.events.on('asset:error', () => this.refreshAssets());
  }

  private button(label: string, fn: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      fn();
      (e.currentTarget as HTMLButtonElement).blur(); // keep WASD on the game
    });
    return b;
  }

  toggle(force?: boolean): void {
    this.el.classList.toggle('hidden', force === undefined ? undefined : !force);
  }

  private refreshAvatar(): void {
    const g = this.game;
    const id = g.state.get(g.playerId)?.avatarId ?? 'mack';
    const def = g.avatars.get(id);
    let src = '';
    try {
      src = g.assets.resolveUrl(def.conceptPortrait);
    } catch {
      /* reported via assets.errors */
    }
    this.avatarEl.innerHTML = `
      <div class="dev-avatar-row">
        ${src ? `<img src="${src}" alt="${def.displayName}" />` : ''}
        <div><b>${def.displayName}</b><small>${def.summary}</small>
        <small class="warn">Kartalla: dev-merkki (spriteatlas puuttuu)</small></div>
      </div>`;
    const prev = this.avatarEl.querySelector('.dev-row');
    prev?.remove();
    const row = document.createElement('div');
    row.className = 'dev-row';
    const all = g.avatars.all();
    row.appendChild(this.button('◀', () => this.pick(all[(all.indexOf(def) - 1 + all.length) % all.length]!.id)));
    row.appendChild(this.button('▶', () => this.pick(all[(all.indexOf(def) + 1) % all.length]!.id)));
    row.appendChild(this.button('Assetit-katalogi', () => this.catalog.toggle(true)));
    this.avatarEl.appendChild(row);
    this.catalog.markSelected(id);
  }

  private pick(id: string): void {
    this.game.setPlayerAvatar(id);
    this.refreshAvatar();
    this.refreshAssets();
  }

  private refreshAssets(): void {
    const all = this.game.assets.report();
    const errs = this.game.assets.errors;
    const concept = all.filter((r) => r.id.startsWith('concept.'));
    const rows = all.filter((r) => !r.id.startsWith('concept.') && (r.refs > 0 || !r.id.startsWith('avatar.') || r.status.startsWith('error')));
    const pendingAtlases = all.filter((r) => r.id.startsWith('avatar.') && r.status === 'pending').length;
    this.assetsEl.innerHTML =
      `<div class="asset ok"><span>concept.* (${concept.length} kpl)</span><em>konsepti · UI-käyttö</em></div>` +
      `<div class="asset warn"><span>avatar.*.atlas (${pendingAtlases} odottaa)</span><em>pending</em></div>` +
      rows
        .map((r) => {
          const cls = r.status.startsWith('error') ? 'err' : r.status === 'pending' ? 'warn' : 'ok';
          if (r.id.startsWith('avatar.') && !r.status.startsWith('error')) return '';
          return `<div class="asset ${cls}"><span>${r.id}</span><em>${r.status}${r.refs ? ` · refs ${r.refs}` : ''}</em></div>`;
        })
        .join('') +
      errs.map((e) => `<div class="asset-err">⚠ ${e.id}: ${e.message}</div>`).join('');
  }

  /** Called every rendered frame; throttled to 4 Hz to keep DOM work negligible. */
  update(frameDt: number): void {
    this.timer += frameDt;
    if (this.timer < 0.25) return;
    this.timer = 0;
    const d = this.game.diagnostics;
    d.sceneObjects = this.game.countSceneObjects();
    const s = d.snapshot();
    const p = this.game.state.get(this.game.playerId);
    const t = p?.transform;
    const tile = t ? worldToTile(t.x, t.z) : null;
    const lines = [
      `FPS        ${s.fps.toFixed(1)}`,
      `frame ms   avg ${s.frameMsAvg.toFixed(2)} · max ${s.frameMsMax.toFixed(2)}`,
      `sim        tick ${s.tick} · ${s.simStepsLastFrame} step/frame`,
      `draw calls ${s.render.drawCalls} (+1 upscale)`,
      `triangles  ${s.render.triangles}`,
      `gpu mem    ${s.render.textures} tex · ${s.render.geometries} geo`,
      `JS heap    ${s.heapMB === null ? 'n/a (selain ei tue)' : s.heapMB.toFixed(1) + ' MB'}`,
      `entities   ${s.entities} · scene objs ${s.sceneObjects}`,
      `res        ${s.internalResolution}`,
      `zoom       ${s.zoom}× device px / art px`,
      t ? `player     x ${t.x.toFixed(2)} z ${t.z.toFixed(2)} · tile ${tile!.tx},${tile!.tz}` : '',
      p ? `speed      ${Math.hypot(p.motion.vx, p.motion.vz).toFixed(2)} m/s${p.motion.running ? ' (run)' : ''}` : '',
      `chunks     ${this.game.worldView.chunkCount}`,
    ];
    this.stats.textContent = lines.filter(Boolean).join('\n');
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.catalog.dispose();
    this.el.remove();
    this.el.parentElement?.querySelector('.dev-open')?.remove();
  }
}
