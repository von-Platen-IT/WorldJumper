import type { RenderStats } from '../scene/GlobeScene';

/**
 * Minimal technical overlay: render statistics for tuning plus the always
 * available reset control that appears once a sequence is running.
 */
export class Hud {
  private readonly root: HTMLElement;
  private readonly statsEl: HTMLElement;
  private readonly phaseEl: HTMLElement;
  private readonly resetButton: HTMLButtonElement;
  private visible = true;

  constructor(root: HTMLElement, onReset: () => void) {
    this.root = root;
    this.root.classList.add('hud');
    this.root.innerHTML = `
      <div class="hud__stats" id="hud-stats">–</div>
      <div class="hud__phase" id="hud-phase"></div>
      <button type="button" class="hud__reset" id="hud-reset" hidden>Zurück <kbd>R</kbd></button>
    `;
    this.statsEl = this.root.querySelector('#hud-stats')!;
    this.phaseEl = this.root.querySelector('#hud-phase')!;
    this.resetButton = this.root.querySelector('#hud-reset')!;
    this.resetButton.addEventListener('click', onReset);
  }

  setStats(stats: RenderStats, fps: number): void {
    this.statsEl.textContent = `${fps.toFixed(0)} fps · ${stats.drawCalls} calls · ${(
      stats.triangles / 1000
    ).toFixed(1)}k tris · ${stats.geometries} geo · ${stats.textures} tex`;
  }

  setPhase(text: string): void {
    this.phaseEl.textContent = text;
  }

  /** Shows the reset affordance only when returning is meaningful. */
  setBusy(busy: boolean): void {
    this.resetButton.hidden = !busy;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.root.classList.toggle('hud--hidden', !visible);
  }

  isVisible(): boolean {
    return this.visible;
  }
}