/**
 * Device-agnostic input.
 *
 * Every device (keyboard, touch joystick, future gamepad) writes into the same
 * `InputActions` structure. Gameplay only ever sees `InputActions` — it has no
 * idea which device produced them.
 */

export interface InputActions {
  /** Screen-relative movement intent. x = right, y = up. Length ≤ 1. */
  moveX: number;
  moveY: number;
  run: boolean;
}

export interface InputSource {
  /** Adds this device's contribution to `out`. Must not allocate. */
  contribute(out: InputActions): void;
  dispose(): void;
}

export function createActions(): InputActions {
  return { moveX: 0, moveY: 0, run: false };
}

export class InputManager {
  private readonly sources: InputSource[] = [];
  private readonly current = createActions();

  add(source: InputSource): void {
    this.sources.push(source);
  }

  /** Samples all devices. Call once per simulation tick. Returns a shared object — copy if stored. */
  sample(): Readonly<InputActions> {
    const a = this.current;
    a.moveX = 0;
    a.moveY = 0;
    a.run = false;
    for (const s of this.sources) s.contribute(a);
    const len = Math.hypot(a.moveX, a.moveY);
    if (len > 1) {
      a.moveX /= len;
      a.moveY /= len;
    }
    return a;
  }

  dispose(): void {
    for (const s of this.sources) s.dispose();
    this.sources.length = 0;
  }
}
