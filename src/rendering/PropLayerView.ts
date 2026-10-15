import * as THREE from 'three';
import type { MapDefinition } from '../world/MapDefinition';
import { PROP_DEFS, resolveCollider } from '../world/props/PropCatalog';
import { buildPropGeometry, type PropGeometry } from './PropGeometry';

/**
 * Static world props drawn from one atlas.
 *
 * Geometry (placement, depth surfaces) comes from PropGeometry — see there for
 * why sprites are mapped onto their footprint's front faces. Props are merged
 * per chunk and per depth mode → a couple of draw calls per chunk.
 *
 * `debug` holds per-prop footprint outlines, collider shapes and floor anchors
 * (hidden unless the dev panel turns them on).
 */
export class PropLayerView {
  readonly root = new THREE.Group();
  readonly debug = new THREE.Group();
  readonly material: THREE.MeshBasicMaterial;
  readonly flatMaterial: THREE.MeshBasicMaterial;
  readonly geometries: PropGeometry[] = [];
  propCount = 0;
  private readonly buffers: THREE.BufferGeometry[] = [];
  private readonly debugMaterials: THREE.Material[] = [];

  constructor(map: MapDefinition, atlas: THREE.Texture, atlasSize: { width: number; height: number }) {
    this.root.name = 'props';
    atlas.wrapS = atlas.wrapT = THREE.ClampToEdgeWrapping;
    atlas.needsUpdate = true;
    this.material = new THREE.MeshBasicMaterial({ map: atlas, alphaTest: 0.5, side: THREE.DoubleSide });
    // Ground decals: never hide characters, never write depth.
    this.flatMaterial = new THREE.MeshBasicMaterial({ map: atlas, alphaTest: 0.5, side: THREE.DoubleSide, depthWrite: false, depthTest: false });

    const byChunk = new Map<string, { pos: number[]; uv: number[]; idx: number[]; flat: boolean }>();
    for (const p of map.props) {
      const g = buildPropGeometry(p);
      if (!g) continue; // World validation already rejects these
      this.geometries.push(g);
      const flat = g.depth === 'flat';
      const key = `${Math.floor(p.x / map.chunkSize)},${Math.floor(p.z / map.chunkSize)}:${flat ? 'flat' : 'solid'}`;
      let c = byChunk.get(key);
      if (!c) byChunk.set(key, (c = { pos: [], uv: [], idx: [], flat }));
      const v0 = c.pos.length / 3;
      const [ax, ay, aw, ah] = g.atlas;
      for (const v of g.vertices) {
        c.pos.push(v.world.x, v.world.y, v.world.z);
        c.uv.push((ax + v.u * aw) / atlasSize.width, 1 - (ay + (1 - v.v) * ah) / atlasSize.height);
      }
      for (const t of g.triangles) c.idx.push(v0 + t);
      this.propCount++;
    }

    for (const [key, c] of byChunk) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(c.pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(c.uv, 2));
      geo.setIndex(c.idx);
      geo.computeBoundingSphere();
      this.buffers.push(geo);
      const mesh = new THREE.Mesh(geo, c.flat ? this.flatMaterial : this.material);
      mesh.name = `props:${key}`;
      mesh.matrixAutoUpdate = false;
      if (c.flat) mesh.renderOrder = -0.5; // after the ground, before everything standing on it
      this.root.add(mesh);
    }

    this.buildDebug(map);
    this.debug.visible = false;
    this.root.add(this.debug);
  }

  private buildDebug(map: MapDefinition): void {
    const footprints: number[] = [];
    const colliders: number[] = [];
    const anchors: number[] = [];
    const y = 0.04;
    const rect = (out: number[], x0: number, z0: number, x1: number, z1: number) =>
      out.push(x0, y, z0, x1, y, z0, x1, y, z0, x1, y, z1, x1, y, z1, x0, y, z1, x0, y, z1, x0, y, z0);
    for (const g of this.geometries) {
      const f = g.footprint;
      rect(footprints, f.minX, f.minZ, f.maxX, f.maxZ);
      const a = g.anchor.front;
      anchors.push(a.x - 0.12, y, a.z, a.x + 0.12, y, a.z, a.x, y, a.z - 0.12, a.x, y, a.z + 0.12);
      const c0 = g.anchor.centre;
      anchors.push(c0.x - 0.06, y, c0.z - 0.06, c0.x + 0.06, y, c0.z + 0.06, c0.x - 0.06, y, c0.z + 0.06, c0.x + 0.06, y, c0.z - 0.06);
    }
    for (const p of map.props) {
      const c = resolveCollider(PROP_DEFS[p.prop]!, p.x, p.z, p.rot);
      if (!c) continue;
      if (c.shape === 'box') rect(colliders, c.minX, c.minZ, c.maxX, c.maxZ);
      else {
        for (let i = 0; i < 16; i++) {
          const a0 = (i / 16) * Math.PI * 2;
          const a1 = ((i + 1) / 16) * Math.PI * 2;
          colliders.push(c.x + Math.cos(a0) * c.r, y, c.z + Math.sin(a0) * c.r, c.x + Math.cos(a1) * c.r, y, c.z + Math.sin(a1) * c.r);
        }
      }
    }
    const add = (pts: number[], color: number, name: string) => {
      if (!pts.length) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const mat = new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 });
      this.buffers.push(geo);
      this.debugMaterials.push(mat);
      const l = new THREE.LineSegments(geo, mat);
      l.name = name;
      l.renderOrder = 20;
      this.debug.add(l);
    };
    add(footprints, 0xffd400, 'prop-footprints');
    add(colliders, 0xff3b6b, 'prop-colliders');
    add(anchors, 0x00ff9c, 'prop-anchors');
  }

  dispose(): void {
    for (const g of this.buffers) g.dispose();
    for (const m of this.debugMaterials) m.dispose();
    this.material.dispose();
    this.flatMaterial.dispose();
    this.root.clear();
  }
}
