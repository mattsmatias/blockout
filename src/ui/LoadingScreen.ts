/** Simple loading / fatal-error screen. */
export class LoadingScreen {
  readonly el: HTMLDivElement;
  private readonly bar: HTMLDivElement;
  private readonly msg: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'loading';
    this.el.innerHTML = `
      <div class="logo">BLOCKOUT<span>BATTLE ROYALE</span></div>
      <div class="bar"><div></div></div>
      <div class="msg">Ladataan…</div>`;
    this.bar = this.el.querySelector('.bar > div')!;
    this.msg = this.el.querySelector('.msg')!;
    parent.appendChild(this.el);
  }

  progress(loaded: number, total: number, label?: string): void {
    this.bar.style.width = `${total ? Math.round((loaded / total) * 100) : 0}%`;
    if (label) this.msg.textContent = label;
  }

  error(message: string): void {
    this.el.classList.add('error');
    this.msg.textContent = message;
  }

  hide(): void {
    this.el.classList.add('done');
    setTimeout(() => this.el.remove(), 400);
  }
}
