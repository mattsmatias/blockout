import * as THREE from 'three';
import type { EntityState } from '../core/GameState';
import { snapToArtPixelGrid } from '../utils/CoordinateUtils';
import { lerp } from '../utils/MathUtils';

/**
 * DEVELOPMENT MARKER — not an avatar.
 *
 * Milestone 1 has no approved Mack sprite atlas. Instead of faking a character,
 * the player is shown as an obviously-placeholder magenta capsule with a facing
 * arrow. The real AvatarRenderer replaces this in Milestone 2.
 */
export class PlayerMarkerView {
  readonly root = new THREE.Group();
  readonly anchorDebug: THREE.Group;
  private readonly body: THREE.Group;
  private readonly bodyMat: THREE.MeshLambertMaterial;
  private readonly headMat: THREE.MeshLambertMaterial;
  private readonly disposables: Array<{ dispose(): void }> = [];

  constructor(radius: number) {
    this.root.name = 'player-dev-marker';
    this.body = new THREE.Group();
    const bodyMat = (this.bodyMat = this.track(new THREE.MeshLambertMaterial({ color: 0xff2bd6 })));
    const headMat = (this.headMat = this.track(new THREE.MeshLambertMaterial({ color: 0xff2bd6 })));
    const darkMat = this.track(new THREE.MeshLambertMaterial({ color: 0x1a1024 }));

    // Height ≈ 1.6 m: same scale the avatar will use, so camera framing is realistic.
    const capsule = new THREE.Mesh(this.track(new THREE.CylinderGeometry(radius * 0.85, radius * 0.85, 1.2, 8)), bodyMat);
    capsule.position.y = 0.6;
    const head = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.44, 0.4, 0.44)), headMat);
    head.position.y = 1.42;
    const arrow = new THREE.Mesh(this.track(new THREE.ConeGeometry(0.14, 0.38, 4)), darkMat);
    arrow.rotation.z = -Math.PI / 2; // point along +X (facing 0)
    arrow.position.set(radius + 0.12, 0.9, 0);
    this.body.add(capsule, head, arrow);

    const shadow = new THREE.Mesh(
      this.track(new THREE.CircleGeometry(radius * 1.15, 12)),
      this.track(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.005;
    this.root.add(shadow, this.body);

    // Foot anchor + collision circle (dev overlay).
    this.anchorDebug = new THREE.Group();
    const ring: number[] = [];
    const seg = 24;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      ring.push(Math.cos(a0) * radius, 0.03, Math.sin(a0) * radius, Math.cos(a1) * radius, 0.03, Math.sin(a1) * radius);
    }
    ring.push(-0.15, 0.03, 0, 0.15, 0.03, 0, 0, 0.03, -0.15, 0, 0.03, 0.15);
    const g = this.track(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(ring, 3));
    const lineMat = this.track(new THREE.LineBasicMaterial({ color: 0x00ff9c, depthTest: false }));
    const lines = new THREE.LineSegments(g, lineMat);
    lines.renderOrder = 10;
    this.anchorDebug.add(lines);
    this.anchorDebug.visible = false;
    this.root.add(this.anchorDebug);
  }

  /**
   * Tints the marker with an avatar's data colours (top = headwear or hair,
   * body = upper body). Still a marker — just tells you which avatar is selected.
   */
  setColors(body: string, top: string): void {
    this.bodyMat.color.set(body);
    this.headMat.color.set(top);
  }

  private track<T extends { dispose(): void }>(r: T): T {
    this.disposables.push(r);
    return r;
  }

  /** Interpolates between the last two simulation ticks and snaps to the art-pixel grid. */
  sync(e: EntityState, alpha: number): void {
    const t = e.transform;
    const p = snapToArtPixelGrid({ x: lerp(t.prevX, t.x, alpha), y: lerp(t.prevY, t.y, alpha), z: lerp(t.prevZ, t.z, alpha) });
    this.root.position.set(p.x, p.y, p.z);
    // three.js rotation.y is counter-clockwise seen from above; facing is atan2(z, x).
    this.body.rotation.y = -t.facing;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
    this.root.clear();
  }
}
