/**
 * Authoritative simulation state.
 *
 * Plain serialisable data only — no three.js objects, no DOM. This is the shape a
 * future server would own and replicate via snapshots; the renderer only reads it.
 */

export type EntityId = number;

export type EntityKind = 'player';

export interface Transform {
  x: number;
  y: number;
  z: number;
  /** Previous tick position, used for render interpolation. */
  prevX: number;
  prevY: number;
  prevZ: number;
  /** Facing angle on XZ in radians (0 = +X, π/2 = +Z). */
  facing: number;
}

export interface Motion {
  vx: number;
  vz: number;
  running: boolean;
}

export interface EntityState {
  id: EntityId;
  kind: EntityKind;
  transform: Transform;
  motion: Motion;
  radius: number;
  /** Avatar definition id. Resolved by the avatar system (Milestone 2). */
  avatarId: string;
}

export interface GameSnapshot {
  tick: number;
  entities: Array<Omit<EntityState, 'transform'> & { transform: Omit<Transform, 'prevX' | 'prevY' | 'prevZ'> }>;
}

export class GameState {
  tick = 0;
  private nextId: EntityId = 1;
  readonly entities = new Map<EntityId, EntityState>();

  createEntity(kind: EntityKind, init: { x: number; z: number; radius: number; avatarId: string }): EntityState {
    const id = this.nextId++;
    const e: EntityState = {
      id,
      kind,
      transform: { x: init.x, y: 0, z: init.z, prevX: init.x, prevY: 0, prevZ: init.z, facing: Math.PI * 0.75 },
      motion: { vx: 0, vz: 0, running: false },
      radius: init.radius,
      avatarId: init.avatarId,
    };
    this.entities.set(id, e);
    return e;
  }

  removeEntity(id: EntityId): boolean {
    return this.entities.delete(id);
  }

  get(id: EntityId): EntityState | undefined {
    return this.entities.get(id);
  }

  /** Call at the beginning of every tick, before systems move things. */
  beginTick(): void {
    for (const e of this.entities.values()) {
      e.transform.prevX = e.transform.x;
      e.transform.prevY = e.transform.y;
      e.transform.prevZ = e.transform.z;
    }
  }

  /** Teleports without interpolation smear. */
  teleport(id: EntityId, x: number, z: number): void {
    const e = this.entities.get(id);
    if (!e) return;
    e.transform.x = e.transform.prevX = x;
    e.transform.z = e.transform.prevZ = z;
    e.motion.vx = e.motion.vz = 0;
  }

  /** JSON-safe snapshot (no interpolation history). */
  snapshot(): GameSnapshot {
    return {
      tick: this.tick,
      entities: [...this.entities.values()].map((e) => ({
        id: e.id,
        kind: e.kind,
        avatarId: e.avatarId,
        radius: e.radius,
        motion: { ...e.motion },
        transform: { x: e.transform.x, y: e.transform.y, z: e.transform.z, facing: e.transform.facing },
      })),
    };
  }
}
