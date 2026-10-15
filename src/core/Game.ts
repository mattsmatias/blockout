import * as THREE from 'three';
import { AssetManager } from '../assets/AssetManager';
import { AvatarRegistry } from '../avatar/AvatarRegistry';
import { GAME_MANIFEST } from '../assets/AssetManifest';
import { InputManager } from '../input/InputManager';
import { KeyboardInput, type KeyEventTarget } from '../input/KeyboardInput';
import { TouchInput } from '../input/TouchInput';
import { updatePlayerMovement } from '../player/PlayerMovement';
import { registerBrowserLoaders } from '../rendering/AssetLoaders';
import { IsometricCamera } from '../rendering/IsometricCamera';
import { PlayerMarkerView } from '../rendering/PlayerMarkerView';
import { PropLayerView } from '../rendering/PropLayerView';
import { PROPS_ATLAS } from '../assets/conceptProps.generated';
import { Renderer } from '../rendering/Renderer';
import { WorldView } from '../rendering/WorldView';
import type { MapDefinition } from '../world/MapDefinition';
import { World } from '../world/World';
import { PLAYER } from './Config';
import { Diagnostics } from './Diagnostics';
import { EventBus, type DevFlag, type GameEvents } from './EventBus';
import { GameLoop } from './GameLoop';
import { GameState, type EntityId } from './GameState';

export interface GameOptions {
  container: HTMLElement;
  overlay: HTMLElement;
  map: MapDefinition;
  dev: boolean;
  baseUrl: string;
}

/**
 * Composition root for one running match/session. Owns every subsystem and
 * tears all of them down in dispose().
 *
 * Data flow per frame:
 *   input devices → InputManager.sample() → simulation tick(s) on GameState
 *   → render(alpha): views read GameState, camera follows, Renderer draws.
 */
export class Game {
  readonly events = new EventBus<GameEvents>();
  readonly state = new GameState();
  readonly diagnostics = new Diagnostics();
  readonly assets: AssetManager;
  readonly input = new InputManager();
  readonly avatars = new AvatarRegistry();
  readonly renderer: Renderer;
  readonly camera = new IsometricCamera();
  readonly scene = new THREE.Scene();
  readonly loop: GameLoop;
  world!: World;
  worldView!: WorldView;
  propView: PropLayerView | null = null;
  playerId: EntityId = 0;
  /** Optional per-frame hook for UI (dev panel, HUD). Never used by simulation. */
  onFrame: ((frameDt: number) => void) | null = null;
  private playerView!: PlayerMarkerView;
  private readonly flags: Record<DevFlag, boolean> = { grid: false, colliders: false, cameraBounds: false, anchors: false };
  private readonly onResize = () => this.resize();
  private resizeObserver: ResizeObserver | null = null;

  constructor(private readonly opts: GameOptions) {
    this.assets = new AssetManager(GAME_MANIFEST, opts.baseUrl, {
      onProgress: (loaded, total, id) => this.events.emit('asset:progress', { loaded, total, id }),
      onError: (id, url, message) => {
        this.events.emit('asset:error', { id, url, message });
        console.error(`[BLOCKOUT asset] ${id} (${url || 'no url'}): ${message}`);
      },
    });
    registerBrowserLoaders(this.assets);
    this.renderer = new Renderer(opts.container);
    this.loop = new GameLoop({
      update: (dt) => this.tick(dt),
      render: (alpha, frameDt) => this.draw(alpha, frameDt),
    });
    this.input.add(new KeyboardInput(window as unknown as KeyEventTarget));
    this.input.add(new TouchInput(opts.container, opts.overlay));

    this.events.on('dev:teleport', ({ x, z }) => {
      this.state.teleport(this.playerId, x, z);
      this.camera.rig.snapTo({ x, z });
    });
    this.events.on('dev:toggle', ({ flag, value }) => this.setFlag(flag, value));
  }

  async load(): Promise<void> {
    const tileTex = await this.assets.acquire<THREE.Texture>('dev.grid');
    for (const id of this.opts.map.assetRefs) await this.assets.acquire(id);

    this.world = new World(this.opts.map);
    this.worldView = new WorldView(this.world, tileTex);
    this.scene.add(this.worldView.root);
    if (this.opts.map.props.length) {
      const atlas = await this.assets.acquire<THREE.Texture>('concept.props.atlas');
      this.propView = new PropLayerView(this.opts.map, atlas, PROPS_ATLAS);
      this.scene.add(this.propView.root);
    }

    const spawn = this.world.spawnPoint();
    const player = this.state.createEntity('player', { x: spawn.x, z: spawn.z, radius: PLAYER.RADIUS, avatarId: 'mack' });
    this.playerId = player.id;
    this.playerView = new PlayerMarkerView(player.radius);
    this.scene.add(this.playerView.root);

    const avatarIssues = this.avatars.validate();
    if (avatarIssues.length) throw new Error(`Avatar data invalid: ${avatarIssues.map((i) => `${i.id}: ${i.message}`).join('; ')}`);
    this.setPlayerAvatar(player.avatarId);

    this.camera.rig.visibleBounds = this.world.visibleBounds;
    this.resize();
    this.camera.rig.snapTo(spawn);
    window.addEventListener('resize', this.onResize);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.onResize);
      this.resizeObserver.observe(this.opts.container);
    }
  }

  start(): void {
    this.loop.start();
  }

  /**
   * Switches the player's avatar identity. The in-world visual stays the dev
   * marker (tinted with the avatar's colours) until that avatar's sprite atlas is
   * approved — requesting the atlas reports it as missing instead of faking it.
   */
  setPlayerAvatar(id: string): void {
    const def = this.avatars.get(id);
    const p = this.state.get(this.playerId);
    if (p) p.avatarId = def.id;
    this.playerView?.setColors(def.upperBody.accent ?? def.upperBody.color, def.headwear?.color ?? def.hairColor);
    this.assets.acquire(def.spriteAtlas).catch(() => {
      /* recorded in assets.errors and shown in the dev panel */
    });
  }

  setZoomOverride(zoom: number | null): void {
    this.renderer.zoomOverride = zoom;
    this.resize();
  }

  setFlag(flag: DevFlag, value: boolean): void {
    this.flags[flag] = value;
    if (!this.worldView) return;
    if (flag === 'grid') this.worldView.debug.grid.visible = value;
    if (flag === 'colliders') this.worldView.debug.colliders.visible = value;
    if (flag === 'cameraBounds') this.worldView.debug.cameraBounds.visible = value;
    if (flag === 'anchors') this.playerView.anchorDebug.visible = value;
  }

  getFlag(flag: DevFlag): boolean {
    return this.flags[flag];
  }

  private resize(): void {
    const rect = this.opts.container.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    this.renderer.resize(w, h, window.devicePixelRatio || 1);
    this.camera.rig.setViewport(this.renderer.deviceWidth, this.renderer.deviceHeight, this.renderer.zoom);
    this.camera.setArtResolution(this.renderer.artWidth, this.renderer.artHeight);
    this.camera.rig.clamp();
    this.diagnostics.zoom = this.renderer.zoom;
    this.diagnostics.internalResolution = `${this.renderer.artWidth}×${this.renderer.artHeight} art px → ${this.renderer.deviceWidth}×${this.renderer.deviceHeight} device px`;
  }

  /** Fixed-step simulation. No rendering, no DOM. */
  private tick(dt: number): void {
    this.state.beginTick();
    const actions = this.input.sample();
    const player = this.state.get(this.playerId);
    if (player) updatePlayerMovement(player, actions, this.world.collision, dt);
    this.state.tick++;
  }

  private draw(alpha: number, frameDt: number): void {
    const player = this.state.get(this.playerId);
    if (player) {
      this.playerView.sync(player, alpha);
      const t = player.transform;
      this.camera.rig.follow({ x: t.prevX + (t.x - t.prevX) * alpha, z: t.prevZ + (t.z - t.prevZ) * alpha }, frameDt);
    }
    this.camera.sync();
    this.renderer.render(this.scene, this.camera.camera);

    const d = this.diagnostics;
    if (frameDt > 0) d.recordFrame(frameDt);
    d.render = this.renderer.info;
    d.simStepsLastFrame = this.loop.stats.stepsLastFrame;
    d.tick = this.state.tick;
    d.entities = this.state.entities.size;
    this.onFrame?.(frameDt);
  }

  countSceneObjects(): number {
    let n = 0;
    this.scene.traverse(() => n++);
    return n;
  }

  dispose(): void {
    this.loop.stop();
    window.removeEventListener('resize', this.onResize);
    this.resizeObserver?.disconnect();
    this.input.dispose();
    this.playerView?.dispose();
    this.propView?.dispose();
    this.worldView?.dispose();
    this.world?.dispose();
    this.scene.clear();
    this.assets.disposeAll();
    this.renderer.dispose();
    this.events.clear();
  }
}
