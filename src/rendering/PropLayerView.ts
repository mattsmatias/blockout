import * as THREE from 'three';
import { PIXELS_PER_UNIT } from '../core/Config';
import type { MapDefinition } from '../world/MapDefinition';
import { PROP_DEFS, propSprite, resolveProp } from '../world/props/PropCatalog';
import { ISO_BASIS, snapToArtPixelGrid } from '../utils/CoordinateUtils';

/**
 * Static world props drawn as upright sprites from one atlas.
 *
 * Each prop is a vertical quad standing on the ground at the FRONT corner of its
 * footprint, turned to face the camera horizontally. Its world height is
 * stretched by 1/cos(elevation) so one sprite pixel is exactly `scale` art pixels
 * on screen. Being vertical, the sprite occludes and is occluded like a real wall
 * at its front edge, so it sorts correctly against both the player and the 3D
 * blocks (a camera-plane quad would lean back and get clipped by nearby walls).
 *
 * All props in a chunk are merged into one geometry → one draw call per chunk.
 */
export class PropLayerView {
  readonly root = new THREE.Group();
  readonly material: THREE.MeshBasicMaterial;
  propCount = 0;
  private readonly geometries: THREE.BufferGeometry[] = [];

  constructor(map: MapDefinition, atlas: THREE.Texture, atlasSize: { width: number; height: number }) {
    this.root.name = 'props';
    atlas.wrapS = atlas.wrapT = THREE.ClampToEdgeWrapping;
    atlas.needsUpdate = true;
    this.material = new THREE.MeshBasicMaterial({ map: atlas, alphaTest: 0.5, side: THREE.DoubleSide });

    const R = ISO_BASIS.right;
    const U = ISO_BASIS.up;
    const byChunk = new Map<string, { pos: number[]; uv: number[]; idx: number[] }>();

    for (const p of map.props) {
      const def = PROP_DEFS[p.prop];
      const resolved = def && resolveProp(def, p.rot);
      const spr = resolved && propSprite(resolved.sprite);
      if (!def || !resolved || !spr) continue; // World validation already rejects these
      const footprint = resolved.footprint;
      const [ax, ay, aw, ah] = spr.atlas as [number, number, number, number];
      const w = (aw * def.scale) / PIXELS_PER_UNIT;
      // Vertical extent: screen height = worldHeight * up.y, so divide it back out.
      const h = (ah * def.scale) / PIXELS_PER_UNIT / U.y;
      // Base point: the footprint's front corner (nearest the camera), slid along
      // screen-right onto the footprint centre's screen column, then pixel-snapped.
      const fx = p.x + footprint[0] / 2;
      const fz = p.z + footprint[1] / 2;
      const shift = (footprint[0] / 2) * R.x + (footprint[1] / 2) * R.z;
      const base = snapToArtPixelGrid({ x: fx - R.x * shift, y: 0, z: fz - R.z * shift });
      // Odd pixel widths need a half-pixel shift so texels stay on the art grid.
      const half = w / 2 + ((aw * def.scale) % 2 ? 0.5 / PIXELS_PER_UNIT : 0);
      const corners = [
        [-half, 0],
        [w - half, 0],
        [w - half, h],
        [-half, h],
      ] as const;

      const key = `${Math.floor(p.x / map.chunkSize)},${Math.floor(p.z / map.chunkSize)}`;
      let c = byChunk.get(key);
      if (!c) byChunk.set(key, (c = { pos: [], uv: [], idx: [] }));
      const v0 = c.pos.length / 3;
      for (const [a, b] of corners) c.pos.push(base.x + R.x * a, base.y + b, base.z + R.z * a);
      const u0 = ax / atlasSize.width;
      const u1 = (ax + aw) / atlasSize.width;
      const vTop = 1 - ay / atlasSize.height;
      const vBot = 1 - (ay + ah) / atlasSize.height;
      c.uv.push(u0, vBot, u1, vBot, u1, vTop, u0, vTop);
      c.idx.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
      this.propCount++;
    }

    for (const [key, c] of byChunk) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(c.pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(c.uv, 2));
      geo.setIndex(c.idx);
      geo.computeBoundingSphere();
      this.geometries.push(geo);
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.name = `props:${key}`;
      mesh.matrixAutoUpdate = false;
      this.root.add(mesh);
    }
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    this.material.dispose();
    this.root.clear();
  }
}
