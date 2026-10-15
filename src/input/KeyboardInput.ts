import type { InputActions, InputSource } from './InputManager';

const UP = ['KeyW', 'ArrowUp'];
const DOWN = ['KeyS', 'ArrowDown'];
const LEFT = ['KeyA', 'ArrowLeft'];
const RIGHT = ['KeyD', 'ArrowRight'];
const RUN = ['ShiftLeft', 'ShiftRight'];
const HANDLED = new Set([...UP, ...DOWN, ...LEFT, ...RIGHT, ...RUN]);

/** Minimal event target so the class can be unit-tested without a DOM. */
export interface KeyEventTarget {
  addEventListener(type: 'keydown' | 'keyup' | 'blur', fn: (e: KeyboardEventLike) => void): void;
  removeEventListener(type: 'keydown' | 'keyup' | 'blur', fn: (e: KeyboardEventLike) => void): void;
}

export interface KeyboardEventLike {
  code?: string;
  target?: unknown;
  preventDefault?(): void;
}

export class KeyboardInput implements InputSource {
  private readonly down = new Set<string>();

  private readonly onDown = (e: KeyboardEventLike) => {
    if (!e.code || isTypingTarget(e.target)) return;
    if (HANDLED.has(e.code)) e.preventDefault?.();
    this.down.add(e.code);
  };
  private readonly onUp = (e: KeyboardEventLike) => {
    if (e.code) this.down.delete(e.code);
  };
  /** Releasing focus must release keys, otherwise the player keeps walking. */
  private readonly onBlur = () => this.down.clear();

  constructor(private readonly target: KeyEventTarget) {
    target.addEventListener('keydown', this.onDown);
    target.addEventListener('keyup', this.onUp);
    target.addEventListener('blur', this.onBlur);
  }

  private any(codes: string[]): boolean {
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }

  contribute(out: InputActions): void {
    let x = 0;
    let y = 0;
    if (this.any(RIGHT)) x += 1;
    if (this.any(LEFT)) x -= 1;
    if (this.any(UP)) y += 1;
    if (this.any(DOWN)) y -= 1;
    if (x !== 0 && y !== 0) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
    out.moveX += x;
    out.moveY += y;
    if (this.any(RUN)) out.run = true;
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onDown);
    this.target.removeEventListener('keyup', this.onUp);
    this.target.removeEventListener('blur', this.onBlur);
    this.down.clear();
  }
}

function isTypingTarget(t: unknown): boolean {
  if (!t || typeof t !== 'object') return false;
  const tag = (t as { tagName?: string }).tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}
