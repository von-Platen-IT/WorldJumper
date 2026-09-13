import type { RenderStats } from '../scene/GlobeScene';
// Downscaled from the 1207x305 original (315 kB → 16 kB); the banner is only
// ever shown at ~152 px wide, so the full-resolution asset is unnecessary.
import logoUrl from '../pics/logo_banner_small.png';

/**
 * Minimal technical overlay: the studio logo, render statistics for tuning and
 * the reset control that appears once a sequence is running. The overlay as a
 * whole and the logo can be hidden independently (H and L).
 */
export class Hud {
  private readonly root: HTMLElement;
  private readonly logoEl: HTMLElement;
  private readonly statsEl: HTMLElement;
  private readonly phaseEl: HTMLElement;
  private readonly resetButton: HTMLButtonElement;
  private visible = true;
  private logoVisible = true;

  constructor(root: HTMLElement, onReset: () => void) {
    this.root = root;
    this.root.classList.add('hud');
    this.root.innerHTML = `
      <img class="hud__logo" id="hud-logo" src="${logoUrl}" alt="IT-Kümmerer" />
      <div class="hud__stats" id="hud-stats">–</div>
      <div class="hud__phase" id="hud-phase"></div>
      <button type="button" class="hud__reset" id="hud-reset" hidden>Zurück <kbd>R</kbd></button>
    `;
    this.logoEl = this.root.querySelector('#hud-logo')!;
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

  /** The logo is separate from the overlay toggle so it can be hidden alone. */
  setLogoVisible(visible: boolean): void {
    this.logoVisible = visible;
    this.logoEl.classList.toggle('hud__logo--hidden', !visible);
  }

  isLogoVisible(): boolean {
    return this.logoVisible;
  }
}
