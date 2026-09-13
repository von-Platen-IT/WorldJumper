import { AnimationDirector, type AnimationPhase, type DirectorStatus } from '../animation/AnimationDirector';

const isInteractive = (phase: AnimationPhase): boolean => phase === 'IDLE' || phase === 'INPUT';
import { FORMATS, PANEL_FADE_MS, TIMING, type FormatKey } from '../config';
import { CountryRegistry } from '../data/CountryRegistry';
import type { CountryFeatureCollection, CountryIndexEntry, CountryIndexFile } from '../data/types';
import { buildWorld } from '../geography/GeographyEngine';
import { GlobeScene } from '../scene/GlobeScene';
import { Hud } from '../ui/Hud';
import { SearchUI } from '../ui/SearchUI';
import { assetUrl } from '../utils/assets';

const PHASE_LABELS: Record<AnimationPhase, string> = {
  IDLE: 'Bereit',
  INPUT: 'Bereit',
  PAUSE_BEFORE_ACTION: 'Pause',
  PREPARE_GLOBE: 'Vorbereitung',
  ORIENT_TO_COUNTRY: 'Ausrichtung',
  ZOOM_TO_COUNTRY: 'Zoom',
  HOLD: 'Ziel erreicht',
  SEQUENCE_PAUSE: 'Pause',
  ERROR: 'Fehler',
};

interface Elements {
  canvas: HTMLCanvasElement;
  stage: HTMLElement;
  uiRoot: HTMLElement;
  hudRoot: HTMLElement;
  safeArea: HTMLElement;
  boot: HTMLElement;
  bootStatus: HTMLElement;
}

/**
 * Wires data, scene, animation and UI together. This is the only place that
 * knows about all of them.
 */
export class AppController {
  private scene!: GlobeScene;
  private director!: AnimationDirector;
  private ui!: SearchUI;
  private hud!: Hud;
  private format: FormatKey = 'landscape';

  private readonly elements: Elements;
  private lastPhase: AnimationPhase | null = null;
  /** Set when the mask was hidden by hand, e.g. to keep a recording clean. */
  private panelHidden = false;
  /** Pending "show the mask again" timer after a finished shot. */
  private maskTimer = 0;
  private frameHandle = 0;
  private lastFrameTime = 0;
  private fps = 0;
  private statsAccumulator = 0;

  constructor() {
    const byId = <T extends HTMLElement>(id: string): T => {
      const el = document.getElementById(id);
      if (!el) throw new Error(`Missing element #${id}`);
      return el as T;
    };
    this.elements = {
      canvas: byId<HTMLCanvasElement>('scene'),
      stage: byId('stage'),
      uiRoot: byId('ui'),
      hudRoot: byId('hud'),
      safeArea: byId('safe-area'),
      boot: byId('boot'),
      bootStatus: byId('boot-status'),
    };
  }

  async init(): Promise<void> {
    // Keep the CSS transition and the code that waits for it in sync.
    document.documentElement.style.setProperty('--panel-fade', `${PANEL_FADE_MS}ms`);
    this.setBootStatus('Länderdaten werden geladen …');
    const [features, index] = await Promise.all([
      fetch(assetUrl('data/countries.geojson')).then((r) => {
        if (!r.ok) throw new Error(`countries.geojson: ${r.status}`);
        return r.json() as Promise<CountryFeatureCollection>;
      }),
      fetch(assetUrl('data/country-index.json')).then((r) => {
        if (!r.ok) throw new Error(`country-index.json: ${r.status}`);
        return r.json() as Promise<CountryIndexFile>;
      }),
    ]);

    this.setBootStatus('Geometrie wird aufgebaut …');
    const world = buildWorld(features, index);

    this.setBootStatus('Szene wird eingerichtet …');
    this.scene = new GlobeScene(this.elements.canvas, world, this.format);

    const registry = new CountryRegistry(index);

    this.director = new AnimationDirector(this.scene, {
      onStatus: (status) => this.onStatus(status),
    });

    this.hud = new Hud(this.elements.hudRoot, () => this.reset());
    this.ui = new SearchUI(this.elements.uiRoot, {
      registry,
      onSubmit: (countries) => this.startSequence(countries),
      onFormatChange: (format) => this.setFormat(format),
      onFocusChange: (focused) => this.director.setIdleMode(focused),
      onSafeAreaToggle: (visible) => this.elements.safeArea.classList.toggle('is-visible', visible),
    });

    this.bindGlobalKeys();
    window.addEventListener('resize', () => this.layout());
    this.layout();
    this.onStatus(this.director.getStatus());

    this.setBootStatus('');
    window.setTimeout(() => this.elements.boot.classList.add('boot--done'), 220);

    this.lastFrameTime = performance.now();
    this.loop(this.lastFrameTime);
  }

  /**
   * Hides the mask first and only then starts the sequence, so nothing moves
   * while the mask is still fading. The calm second that follows is the pause
   * required by the flow.
   */
  private async startSequence(countries: CountryIndexEntry[]): Promise<void> {
    this.hud.setBusy(true);
    await this.ui.hideForSequence();
    this.director.start(countries);
  }

  private reset(): void {
    this.director.reset();
  }

  private setFormat(format: FormatKey): void {
    this.format = format;
    this.scene.setFormat(format);
    this.layout();
  }

  /** Sizes the fixed-aspect stage to fit the viewport without distortion. */
  private layout(): void {
    const { width, height } = FORMATS[this.format];
    const scale = Math.min(window.innerWidth / width, window.innerHeight / height) * 0.96;
    const w = Math.max(240, Math.round(width * scale));
    const h = Math.max(240, Math.round(height * scale));
    this.elements.stage.style.width = `${w}px`;
    this.elements.stage.style.height = `${h}px`;
    this.scene.resize(w, h);
  }

  private onStatus(status: DirectorStatus): void {
    const label = PHASE_LABELS[status.phase];
    const country = status.country?.nameDe ? ` · ${status.country.nameDe}` : '';
    const progress = status.total > 1 ? ` · ${Math.min(status.index + 1, status.total)}/${status.total}` : '';
    this.hud.setPhase(`${label}${country}${progress}`);

    if (this.lastPhase === status.phase) return;

    const wasBusy = this.lastPhase !== null && !isInteractive(this.lastPhase);
    const available = this.isPanelAvailable(status.phase);
    // Every phase change clears a manual hide, so the next country brings the
    // mask back even if it was hidden for a recording.
    this.panelHidden = false;
    window.clearTimeout(this.maskTimer);

    // The reset affordance stays visible while a country is held.
    this.hud.setBusy(!isInteractive(status.phase));

    if (!available) {
      this.ui.setBusy(true);
    } else if (status.phase === 'HOLD' && wasBusy) {
      // Let the finished shot stand for a moment so the label can be read
      // before the mask covers the frame again.
      this.maskTimer = window.setTimeout(() => {
        if (this.lastPhase === 'HOLD' && !this.panelHidden) this.ui.setBusy(false);
      }, TIMING.maskAfterHold);
    } else {
      this.ui.setBusy(this.panelHidden);
    }

    if (wasBusy && available) {
      // Clear and refocus only when coming back from a film sequence, so a
      // simple focus/blur cycle never wipes what the user typed.
      this.ui.resetInputs();
      // Not focused while a country is held: leaving focus off the field keeps
      // the shortcuts (E hides the mask) working straight away.
      if (status.phase !== 'HOLD') this.ui.focus();
    }
    this.lastPhase = status.phase;
  }

  /** Phases in which the search panel is usable. */
  private isPanelAvailable(phase: AnimationPhase): boolean {
    return phase === 'IDLE' || phase === 'INPUT' || phase === 'HOLD';
  }

  /**
   * Shows or hides the input mask without touching the scene. While a country
   * is held this lets a recording stay free of the mask; the next country can
   * still be typed as soon as the mask is back.
   */
  private togglePanel(): void {
    if (!this.lastPhase || !this.isPanelAvailable(this.lastPhase)) return;
    this.panelHidden = !this.panelHidden;
    this.ui.setBusy(this.panelHidden);
  }

  private bindGlobalKeys(): void {
    window.addEventListener('keydown', (event) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
      const key = event.key.toLowerCase();

      if (key === 'r' && !typing) {
        this.reset();
        return;
      }
      if (event.key === 'Escape') {
        this.reset();
        return;
      }
      if (key === 'h' && !typing) {
        this.hud.setVisible(!this.hud.isVisible());
        return;
      }
      if (key === 'l' && !typing) {
        this.hud.setLogoVisible(!this.hud.isLogoVisible());
        return;
      }
      if (key === 'e' && !typing) {
        this.togglePanel();
        return;
      }
      if (key === 's' && !typing) {
        const visible = !this.elements.safeArea.classList.contains('is-visible');
        this.elements.safeArea.classList.toggle('is-visible', visible);
      }
    });
  }

  private loop = (now: number): void => {
    this.frameHandle = requestAnimationFrame(this.loop);
    const dt = Math.min(50, now - this.lastFrameTime);
    this.lastFrameTime = now;

    if (dt > 0) this.fps = this.fps * 0.9 + (1000 / dt) * 0.1;

    this.director.update(dt);
    this.scene.render();

    this.statsAccumulator += dt;
    if (this.statsAccumulator > 250) {
      this.statsAccumulator = 0;
      this.hud.setStats(this.scene.getStats(), this.fps);
    }
  };

  private setBootStatus(text: string): void {
    this.elements.bootStatus.textContent = text;
  }

  showBootError(message: string): void {
    this.elements.bootStatus.textContent = message;
    this.elements.bootStatus.classList.add('boot__status--error');
    this.elements.boot.classList.remove('boot--done');
  }

  dispose(): void {
    window.clearTimeout(this.maskTimer);
    cancelAnimationFrame(this.frameHandle);
    this.scene?.dispose();
  }
}