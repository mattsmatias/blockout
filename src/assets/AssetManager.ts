import type { AssetEntry, AssetManifest, AssetType } from './AssetManifest';
import { validateManifest } from './AssetManifest';

/**
 * Central asset loading.
 *
 * - One cache keyed by asset id: the same asset is never fetched twice, even if
 *   two systems request it concurrently (the in-flight promise is shared).
 * - Reference counted: `release(id)` disposes the resource when the last user lets go.
 * - Missing / pending assets fail loudly and are recorded in `errors`, so the dev
 *   panel can show them. There is no silent fallback.
 * - Loaders are injected, which keeps this class free of three.js and unit-testable.
 */

export interface LoadedAsset<T = unknown> {
  value: T;
  dispose?: () => void;
}

export type AssetLoader = (entry: AssetEntry, baseUrl: string) => Promise<LoadedAsset>;

export class AssetError extends Error {
  constructor(
    public readonly assetId: string,
    message: string,
  ) {
    super(`[asset:${assetId}] ${message}`);
    this.name = 'AssetError';
  }
}

interface CacheRecord {
  entry: AssetEntry;
  promise: Promise<LoadedAsset>;
  asset: LoadedAsset | null;
  refs: number;
}

export interface AssetManagerEvents {
  onProgress?: (loaded: number, total: number, id: string) => void;
  onError?: (id: string, url: string, message: string) => void;
}

export class AssetManager {
  private readonly entries = new Map<string, AssetEntry>();
  private readonly cache = new Map<string, CacheRecord>();
  private readonly loaders = new Map<AssetType, AssetLoader>();
  readonly errors: Array<{ id: string; url: string; message: string }> = [];
  /** How many times a loader actually ran (diagnostics / dedup tests). */
  loadCount = 0;

  constructor(
    manifest: AssetManifest,
    private readonly baseUrl = '',
    private readonly events: AssetManagerEvents = {},
  ) {
    const issues = validateManifest(manifest);
    if (issues.length) {
      throw new AssetError('manifest', issues.map((i) => `${i.id}: ${i.message}`).join('; '));
    }
    for (const e of manifest.entries) this.entries.set(e.id, e);
  }

  registerLoader(type: AssetType, loader: AssetLoader): void {
    this.loaders.set(type, loader);
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  entry(id: string): AssetEntry | undefined {
    return this.entries.get(id);
  }

  /**
   * Resolves a declared asset to its URL for DOM use (<img> in tools/UI).
   * Goes through the manifest so UI never hard-codes paths; pending assets throw.
   */
  resolveUrl(id: string): string {
    const entry = this.entries.get(id);
    if (!entry) throw this.fail(id, '', 'not declared in the asset manifest');
    if (entry.status === 'pending' || entry.status === 'dev') {
      throw this.fail(id, entry.url, `${entry.status} asset has no file to show`);
    }
    return this.baseUrl + entry.url;
  }

  /** Loads (or reuses) an asset and takes one reference to it. */
  async acquire<T>(id: string): Promise<T> {
    let rec = this.cache.get(id);
    if (!rec) {
      const entry = this.entries.get(id);
      if (!entry) throw this.fail(id, '', 'not declared in the asset manifest');
      if (entry.status === 'pending') {
        throw this.fail(id, entry.url, `pending — required by milestone ${entry.milestone ?? '?'}, not produced yet`);
      }
      const loader = this.loaders.get(entry.type);
      if (!loader) throw this.fail(id, entry.url, `no loader registered for type "${entry.type}"`);
      this.loadCount++;
      const promise = loader(entry, this.baseUrl).catch((err: unknown) => {
        this.cache.delete(id);
        throw this.fail(id, entry.url, err instanceof Error ? err.message : String(err));
      });
      rec = { entry, promise, asset: null, refs: 0 };
      this.cache.set(id, rec);
    }
    rec.refs++;
    try {
      const asset = await rec.promise;
      rec.asset = asset;
      return asset.value as T;
    } catch (err) {
      rec.refs--;
      throw err;
    }
  }

  /** Loads several assets with progress reporting. Rejects on the first failure after all settle. */
  async acquireAll(ids: string[]): Promise<Map<string, unknown>> {
    let loaded = 0;
    const out = new Map<string, unknown>();
    const results = await Promise.allSettled(
      ids.map(async (id) => {
        const v = await this.acquire(id);
        out.set(id, v);
        loaded++;
        this.events.onProgress?.(loaded, ids.length, id);
      }),
    );
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed) throw failed.reason;
    return out;
  }

  /** Drops one reference. The resource is disposed when no references remain. */
  release(id: string): void {
    const rec = this.cache.get(id);
    if (!rec) return;
    rec.refs--;
    if (rec.refs <= 0) {
      this.cache.delete(id);
      rec.asset?.dispose?.();
    }
  }

  get loadedIds(): string[] {
    return [...this.cache.keys()];
  }

  refCount(id: string): number {
    return this.cache.get(id)?.refs ?? 0;
  }

  /** Disposes everything regardless of reference counts (scene teardown). */
  disposeAll(): void {
    for (const rec of this.cache.values()) rec.asset?.dispose?.();
    this.cache.clear();
  }

  /** Every manifest entry with its runtime state, for the dev panel. */
  report(): Array<{ id: string; status: string; refs: number; url: string }> {
    return [...this.entries.values()].map((e) => ({
      id: e.id,
      status: this.errors.some((x) => x.id === e.id) ? `error (${e.status})` : this.cache.has(e.id) ? 'loaded' : e.status,
      refs: this.refCount(e.id),
      url: e.url,
    }));
  }

  private fail(id: string, url: string, message: string): AssetError {
    if (!this.errors.some((e) => e.id === id && e.message === message)) {
      this.errors.push({ id, url, message });
      this.events.onError?.(id, url, message);
    }
    return new AssetError(id, message);
  }
}
