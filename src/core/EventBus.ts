/** Minimal strongly-typed synchronous event bus. */

export type EventMap = Record<string, unknown>;
type Handler<T> = (payload: T) => void;

export class EventBus<E extends EventMap> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(type: K, handler: Handler<E[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as Handler<never>);
    return () => this.off(type, handler);
  }

  off<K extends keyof E>(type: K, handler: Handler<E[K]>): void {
    this.handlers.get(type)?.delete(handler as Handler<never>);
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const h of [...set]) (h as Handler<E[K]>)(payload);
  }

  clear(): void {
    this.handlers.clear();
  }

  listenerCount(type: keyof E): number {
    return this.handlers.get(type)?.size ?? 0;
  }
}

/** Engine-wide events. Extend as systems are added. */
export interface GameEvents extends EventMap {
  'asset:progress': { loaded: number; total: number; id: string };
  'asset:error': { id: string; url: string; message: string };
  'dev:teleport': { x: number; z: number };
  'dev:toggle': { flag: DevFlag; value: boolean };
}

export type DevFlag = 'grid' | 'colliders' | 'cameraBounds' | 'anchors';
