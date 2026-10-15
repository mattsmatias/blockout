import * as THREE from 'three';
import type { ObstacleDef, TileKind } from '../world/MapDefinition';
import { tileAt } from '../world/MapDefinition';
import type { World } from '../world/World';

/**
 * Visual representation of a World. Reads map data, never mutates it, and owns
 * every GPU resource it creates (see dispose()).
 *
 * Milestone 1 uses flat dev colours + a procedural grid texture. Real Neon City
 * tiles replace the palette in Milestone 3 without changing this structure.
 */

const DEV_TILE_COLORS: Record<TileKind, number> = {
  ground: 0x3b3f58,
  road: 0x2a2c3a,
  sidewalk: 0x6d6f86,
  grass: 0x3f7a4a,
  water: 0x1b4f8a,
  plaza: 0x6a5a7e,
};

const LOOK_COLORS: Record<ObstacleDef['look'], number> = {
  block: 0x8b8fa8,
  crate: 0xb07a3e,
  pillar: 0xc9c9d6,
};

export class WorldView {
  readonly root = new THREE.Group();
  readonly debug = {
    grid: new THREE.Group(),
    colliders: new THREE.Group(),
    cameraBounds: new THREE.Group(),
  };
  private readonly disposables: Array<{ dispose(): void }> = [];
  chunkCount = 0;

  constructor(
    private readonly world: World,
    private readonly tileTexture: THREE.Texture,
  ) {
    this.root.name = `WorldView:${world.def.id}`;
    this.buildGround();
    this.buildBorder();
    this.buildObstacles();
    this.buildLighting();
    this.buildDebug();
    for (const g of Object.values(this.debug)) {
      g.visible = false;
      this.root.add(g);
    }
  }

  private track<T extends { dispose(): void }>(r: T): T {
    this.disposables.push(r);
    return r;
  }

  /** One merged mesh per chunk: chunkSize² tiles → 1 draw call. */
  private buildGround(): void {
    const def = this.world.def;
    const cs = def.chunkSize;
    // Flat ground never writes depth: everything stands on it, and camera-plane
    // prop sprites dip below y=0 at their base (see PropLayerView).
    const mat = this.track(new THREE.MeshLambertMaterial({ map: this.tileTexture, vertexColors: true, depthWrite: false }));
    const color = new THREE.Color();
    for (let cz = 0; cz < def.depth; cz += cs) {
      for (let cx = 0; cx < def.width; cx += cs) {
        const pos: number[] = [];
        const uv: number[] = [];
        const col: number[] = [];
        const nrm: number[] = [];
        const idx: number[] = [];
        let v = 0;
        for (let tz = cz; tz < Math.min(cz + cs, def.depth); tz++) {
          for (let tx = cx; tx < Math.min(cx + cs, def.width); tx++) {
            const kind = tileAt(def, tx, tz) ?? 'ground';
            color.setHex(DEV_TILE_COLORS[kind]);
            pos.push(tx, 0, tz, tx + 1, 0, tz, tx + 1, 0, tz + 1, tx, 0, tz + 1);
            uv.push(0, 1, 1, 1, 1, 0, 0, 0);
            for (let k = 0; k < 4; k++) {
              col.push(color.r, color.g, color.b);
              nrm.push(0, 1, 0);
            }
            idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
            v += 4;
          }
        }
        const geo = this.track(new THREE.BufferGeometry());
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
        geo.setIndex(idx);
        geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, mat);
        mesh.name = `chunk:${cx / cs},${cz / cs}`;
        mesh.renderOrder = -1;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        this.root.add(mesh);
        this.chunkCount++;
      }
    }
  }

  /** Water around the playable area so the camera never shows empty space. */
  private buildBorder(): void {
    const b = this.world.visibleBounds;
    const w = b.maxX - b.minX;
    const d = b.maxZ - b.minZ;
    const geo = this.track(new THREE.PlaneGeometry(w + 40, d + 40));
    geo.rotateX(-Math.PI / 2);
    const mat = this.track(new THREE.MeshLambertMaterial({ color: DEV_TILE_COLORS.water, depthWrite: false }));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = -3;
    mesh.position.set((b.minX + b.maxX) / 2, -0.25, (b.minZ + b.maxZ) / 2);
    mesh.name = 'border-water';
    this.root.add(mesh);
    // Island edge: a thin wall so the land reads as raised above the water.
    const def = this.world.def;
    const edgeGeo = this.track(new THREE.BoxGeometry(def.width, 0.25, def.depth));
    const edgeMat = this.track(new THREE.MeshLambertMaterial({ color: 0x2b2438, depthWrite: false }));
    const edge = new THREE.Mesh(edgeGeo, edgeMat);
    edge.renderOrder = -2;
    edge.position.set(def.width / 2, -0.125 - 0.001, def.depth / 2);
    edge.name = 'island-edge';
    this.root.add(edge);
  }

  /** One InstancedMesh per look → constant draw calls regardless of obstacle count. */
  private buildObstacles(): void {
    const byLook = new Map<ObstacleDef['look'], ObstacleDef[]>();
    for (const o of this.world.def.obstacles) {
      const list = byLook.get(o.look) ?? [];
      list.push(o);
      byLook.set(o.look, list);
    }
    const unit = this.track(new THREE.BoxGeometry(1, 1, 1));
    unit.translate(0.5, 0.5, 0.5); // origin at min corner on the floor
    const m = new THREE.Matrix4();
    for (const [look, list] of byLook) {
      const mat = this.track(new THREE.MeshLambertMaterial({ color: LOOK_COLORS[look] }));
      const inst = new THREE.InstancedMesh(unit, mat, list.length);
      inst.name = `obstacles:${look}`;
      list.forEach((o, i) => {
        m.makeScale(o.width, o.height, o.depth).setPosition(o.x, 0, o.z);
        inst.setMatrixAt(i, m);
      });
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
      this.root.add(inst);
    }
  }

  private buildLighting(): void {
    const L = this.world.def.lighting;
    const hemi = new THREE.HemisphereLight(L.ambientSky, L.ambientGround, L.ambientIntensity);
    const sun = new THREE.DirectionalLight(L.sunColor, L.sunIntensity);
    sun.position.set(L.sunFrom.x, L.sunFrom.y, L.sunFrom.z).normalize();
    this.root.add(hemi, sun);
  }

  private buildDebug(): void {
    const def = this.world.def;
    // Tile grid.
    const gp: number[] = [];
    for (let x = 0; x <= def.width; x++) gp.push(x, 0.01, 0, x, 0.01, def.depth);
    for (let z = 0; z <= def.depth; z++) gp.push(0, 0.01, z, def.width, 0.01, z);
    this.debug.grid.add(this.lines(gp, 0x00e5ff, 'debug-grid'));
    // Chunk borders.
    const cp: number[] = [];
    for (let x = 0; x <= def.width; x += def.chunkSize) cp.push(x, 0.02, 0, x, 0.02, def.depth);
    for (let z = 0; z <= def.depth; z += def.chunkSize) cp.push(0, 0.02, z, def.width, 0.02, z);
    this.debug.grid.add(this.lines(cp, 0xffd400, 'debug-chunks'));
    // Colliders.
    const kp: number[] = [];
    for (const b of this.world.collision.boxes) {
      if (!b.circle) {
        rect(kp, b.minX, b.minZ, b.maxX, b.maxZ, 0.03);
        continue;
      }
      const { x, z, r } = b.circle;
      for (let i = 0; i < 16; i++) {
        const a0 = (i / 16) * Math.PI * 2;
        const a1 = ((i + 1) / 16) * Math.PI * 2;
        kp.push(x + Math.cos(a0) * r, 0.03, z + Math.sin(a0) * r, x + Math.cos(a1) * r, 0.03, z + Math.sin(a1) * r);
      }
    }
    this.debug.colliders.add(this.lines(kp, 0xff3b6b, 'debug-colliders'));
    // Play + camera-visible bounds.
    const bp: number[] = [];
    const v = this.world.visibleBounds;
    rect(bp, v.minX, v.minZ, v.maxX, v.maxZ, 0.04);
    const p = this.world.playBounds;
    rect(bp, p.minX, p.minZ, p.maxX, p.maxZ, 0.04);
    this.debug.cameraBounds.add(this.lines(bp, 0x7cff6b, 'debug-bounds'));
  }

  private lines(points: number[], color: number, name: string): THREE.LineSegments {
    const geo = this.track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    // Debug lines draw on top of everything so colliders under props stay visible.
    const mat = this.track(new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85, depthTest: false }));
    const l = new THREE.LineSegments(geo, mat);
    l.renderOrder = 19;
    l.name = name;
    return l;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
    this.root.clear();
  }
}

function rect(out: number[], x0: number, z0: number, x1: number, z1: number, y: number): void {
  out.push(x0, y, z0, x1, y, z0, x1, y, z0, x1, y, z1, x1, y, z1, x0, y, z1, x0, y, z1, x0, y, z0);
}
