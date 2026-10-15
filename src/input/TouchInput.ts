import type { InputActions, InputSource } from './InputManager';

/**
 * Pure virtual-joystick math (unit-tested without a DOM).
 * Origin is where the finger first touched; screen y grows downward.
 */
export class VirtualStick {
  active = false;
  pointerId = -1;
  originX = 0;
  originY = 0;
  x = 0;
  /** Up-positive output (screen-up = +1). */
  y = 0;

  constructor(
    /** Thumb travel in CSS px that counts as full deflection. */
    public radius = 56,
    /** Deflection below this fraction is ignored. */
    public deadZone = 0.12,
    /** Deflection above this fraction means run. */
    public runThreshold = 0.92,
  ) {}

  begin(pointerId: number, sx: number, sy: number): void {
    this.active = true;
    this.pointerId = pointerId;
    this.originX = sx;
    this.originY = sy;
    this.x = this.y = 0;
  }

  move(sx: number, sy: number): void {
    if (!this.active) return;
    let dx = (sx - this.originX) / this.radius;
    let dy = -(sy - this.originY) / this.radius;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    const mag = Math.min(len, 1);
    if (mag < this.deadZone) {
      this.x = this.y = 0;
      return;
    }
    // Rescale so output starts at 0 just outside the dead zone.
    const scaled = (mag - this.deadZone) / (1 - this.deadZone);
    const k = mag > 0 ? scaled / mag : 0;
    this.x = dx * k;
    this.y = dy * k;
  }

  end(): void {
    this.active = false;
    this.pointerId = -1;
    this.x = this.y = 0;
  }

  get magnitude(): number {
    return Math.hypot(this.x, this.y);
  }

  get running(): boolean {
    return this.magnitude >= this.runThreshold;
  }
}

/**
 * Left-half floating joystick. Touch anywhere on the left half of the screen to
 * spawn the stick under the thumb. Only pointerType "touch" is handled so mouse
 * users are unaffected.
 */
export class TouchInput implements InputSource {
  readonly stick = new VirtualStick();
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;

  private readonly onDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' || this.stick.active) return;
    if (e.clientX > window.innerWidth * 0.5) return;
    if ((e.target as HTMLElement | null)?.closest?.('[data-ui]')) return;
    e.preventDefault();
    this.stick.begin(e.pointerId, e.clientX, e.clientY);
    this.el.setPointerCapture?.(e.pointerId);
    this.draw(e.clientX, e.clientY);
  };
  private readonly onMove = (e: PointerEvent) => {
    if (e.pointerId !== this.stick.pointerId) return;
    e.preventDefault();
    this.stick.move(e.clientX, e.clientY);
    this.draw(e.clientX, e.clientY);
  };
  private readonly onUp = (e: PointerEvent) => {
    if (e.pointerId !== this.stick.pointerId) return;
    this.stick.end();
    this.base.style.display = 'none';
  };

  constructor(private readonly el: HTMLElement, overlay: HTMLElement) {
    this.base = document.createElement('div');
    this.base.className = 'stick-base';
    this.knob = document.createElement('div');
    this.knob.className = 'stick-knob';
    this.base.appendChild(this.knob);
    this.base.style.display = 'none';
    overlay.appendChild(this.base);
    el.addEventListener('pointerdown', this.onDown, { passive: false });
    el.addEventListener('pointermove', this.onMove, { passive: false });
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
  }

  private draw(cx: number, cy: number): void {
    const s = this.stick;
    this.base.style.display = 'block';
    this.base.style.left = `${s.originX}px`;
    this.base.style.top = `${s.originY}px`;
    let dx = cx - s.originX;
    let dy = cy - s.originY;
    const len = Math.hypot(dx, dy);
    if (len > s.radius) {
      dx = (dx / len) * s.radius;
      dy = (dy / len) * s.radius;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    this.base.classList.toggle('running', s.running);
  }

  contribute(out: InputActions): void {
    if (!this.stick.active) return;
    out.moveX += this.stick.x;
    out.moveY += this.stick.y;
    if (this.stick.running) out.run = true;
  }

  dispose(): void {
    this.el.removeEventListener('pointerdown', this.onDown);
    this.el.removeEventListener('pointermove', this.onMove);
    this.el.removeEventListener('pointerup', this.onUp);
    this.el.removeEventListener('pointercancel', this.onUp);
    this.base.remove();
  }
}
