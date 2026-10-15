import { FIXED_DT, SIMULATION } from './Config';

export interface LoopCallbacks {
  /** Advances the simulation by exactly `dt` seconds (always FIXED_DT). */
  update(dt: number, tick: number): void;
  /**
   * Draws the current state. `alpha` ∈ [0, 1) is how far real time has progressed
   * between the last two simulation ticks — use it to interpolate visuals.
   */
  render(alpha: number, frameDt: number): void;
}

export interface LoopStats {
  tick: number;
  stepsLastFrame: number;
  /** Real seconds dropped because a frame exceeded MAX_FRAME_TIME or MAX_STEPS. */
  droppedTime: number;
}

/**
 * Fixed-timestep loop with interpolated rendering ("Fix your timestep").
 *
 * Driving is decoupled from the browser: `advance(realDt)` is pure and fully
 * testable; `start()` just feeds it from requestAnimationFrame.
 */
export class GameLoop {
  private accumulator = 0;
  private rafId: number | null = null;
  private lastTime = -1;
  readonly stats: LoopStats = { tick: 0, stepsLastFrame: 0, droppedTime: 0 };

  constructor(
    private readonly callbacks: LoopCallbacks,
    private readonly fixedDt: number = FIXED_DT,
  ) {}

  /** Feed `realDt` seconds of wall-clock time. Returns the number of simulation steps run. */
  advance(realDt: number): number {
    let frameDt = realDt;
    if (!(frameDt >= 0)) frameDt = 0; // NaN / negative guard
    if (frameDt > SIMULATION.MAX_FRAME_TIME) {
      this.stats.droppedTime += frameDt - SIMULATION.MAX_FRAME_TIME;
      frameDt = SIMULATION.MAX_FRAME_TIME;
    }
    this.accumulator += frameDt;

    let steps = 0;
    // Small epsilon so 1/60 accumulated 60× does not lose a step to float error.
    const eps = 1e-9;
    while (this.accumulator + eps >= this.fixedDt) {
      if (steps >= SIMULATION.MAX_STEPS_PER_FRAME) {
        this.stats.droppedTime += this.accumulator;
        this.accumulator = 0;
        break;
      }
      this.callbacks.update(this.fixedDt, this.stats.tick);
      this.stats.tick++;
      this.accumulator -= this.fixedDt;
      steps++;
    }
    if (this.accumulator < 0) this.accumulator = 0;
    this.stats.stepsLastFrame = steps;
    this.callbacks.render(this.accumulator / this.fixedDt, frameDt);
    return steps;
  }

  start(): void {
    if (this.rafId !== null) return;
    const frame = (now: number) => {
      this.rafId = requestAnimationFrame(frame);
      const dt = this.lastTime < 0 ? 0 : (now - this.lastTime) / 1000;
      this.lastTime = now;
      this.advance(dt);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  stop(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.lastTime = -1;
  }

  get running(): boolean {
    return this.rafId !== null;
  }
}
