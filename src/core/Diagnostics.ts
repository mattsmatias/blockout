/**
 * Rolling performance metrics. Collected always (cheap), shown only in ?dev=1.
 * Values are measurements of the current device, not claims about other devices.
 */

export interface RenderInfo {
  drawCalls: number;
  triangles: number;
  textures: number;
  geometries: number;
}

export interface DiagnosticsSnapshot {
  fps: number;
  frameMsAvg: number;
  frameMsMax: number;
  simStepsLastFrame: number;
  tick: number;
  render: RenderInfo;
  heapMB: number | null;
  entities: number;
  sceneObjects: number;
  internalResolution: string;
  zoom: number;
}

const WINDOW = 120;

export class Diagnostics {
  private frameTimes = new Float64Array(WINDOW);
  private index = 0;
  private filled = 0;
  render: RenderInfo = { drawCalls: 0, triangles: 0, textures: 0, geometries: 0 };
  simStepsLastFrame = 0;
  tick = 0;
  entities = 0;
  sceneObjects = 0;
  internalResolution = '';
  zoom = 1;

  recordFrame(frameSeconds: number): void {
    this.frameTimes[this.index] = frameSeconds * 1000;
    this.index = (this.index + 1) % WINDOW;
    if (this.filled < WINDOW) this.filled++;
  }

  snapshot(): DiagnosticsSnapshot {
    let sum = 0;
    let max = 0;
    for (let i = 0; i < this.filled; i++) {
      const v = this.frameTimes[i]!;
      sum += v;
      if (v > max) max = v;
    }
    const avg = this.filled ? sum / this.filled : 0;
    const perf = (globalThis.performance as Performance & { memory?: { usedJSHeapSize: number } }) ?? undefined;
    const heap = perf?.memory ? perf.memory.usedJSHeapSize / (1024 * 1024) : null;
    return {
      fps: avg > 0 ? 1000 / avg : 0,
      frameMsAvg: avg,
      frameMsMax: max,
      simStepsLastFrame: this.simStepsLastFrame,
      tick: this.tick,
      render: { ...this.render },
      heapMB: heap,
      entities: this.entities,
      sceneObjects: this.sceneObjects,
      internalResolution: this.internalResolution,
      zoom: this.zoom,
    };
  }
}
