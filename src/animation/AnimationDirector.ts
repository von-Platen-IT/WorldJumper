import { Quaternion, Vector3 } from 'three';
import { IDLE_SPIN_SPEED, TIMING } from '../config';
import type { CountryIndexEntry } from '../data/types';
import { latLonToDirection } from '../geography/geoProjection';
import { orientationForDirection } from '../geography/orientation';
import type { GlobeScene } from '../scene/GlobeScene';
import { cameraEase, clamp01, fadeEase, globeEase, lerp } from './easing';

export type AnimationPhase =
  | 'IDLE'
  | 'INPUT'
  | 'PAUSE_BEFORE_ACTION'
  | 'PREPARE_GLOBE'
  | 'ORIENT_TO_COUNTRY'
  | 'ZOOM_TO_COUNTRY'
  | 'HOLD'
  | 'SEQUENCE_PAUSE'
  | 'ERROR';

export interface DirectorStatus {
  phase: AnimationPhase;
  index: number;
  total: number;
  country: CountryIndexEntry | null;
}

export interface DirectorCallbacks {
  onStatus?: (status: DirectorStatus) => void;
  onSequenceComplete?: () => void;
}

interface Transition {
  startQuaternion: Quaternion;
  targetQuaternion: Quaternion;
  startDistance: number;
  pullDistance: number;
  endDistance: number;
  startIntensity: number;
}

const AXIS_Y = new Vector3(0, 1, 0);

/**
 * The single source of truth for every camera and globe movement.
 * The exact required order is encoded as an explicit state machine:
 *
 * input → PAUSE (1000 ms) → PREPARE → ORIENT → ZOOM → HOLD
 *                          ↖──── SEQUENCE_PAUSE (1000 ms) ────┘
 */
export class AnimationDirector {
  private phase: AnimationPhase = 'IDLE';
  private phaseElapsed = 0;
  private phaseDuration = 0;

  private queue: CountryIndexEntry[] = [];
  private current: CountryIndexEntry | null = null;
  private total = 0;
  private done = 0;

  private transition: Transition | null = null;
  private labelOpacity = 0;
  private preparedCurrent = false;

  private resetTween: {
    elapsed: number;
    duration: number;
    fromDistance: number;
    fromQuaternion: Quaternion;
  } | null = null;

  constructor(
    private readonly scene: GlobeScene,
    private readonly callbacks: DirectorCallbacks = {},
  ) {}

  getStatus(): DirectorStatus {
    return {
      phase: this.phase,
      index: this.done,
      total: this.total,
      country: this.current,
    };
  }

  get isBusy(): boolean {
    return (
      this.phase !== 'IDLE' &&
      this.phase !== 'INPUT' &&
      this.phase !== 'ERROR' &&
      this.phase !== 'HOLD'
    );
  }

  /** Called when the search field gains or loses focus – purely informational. */
  setIdleMode(active: boolean): void {
    if (this.phase === 'INPUT' || this.phase === 'IDLE') {
      this.setPhase(active ? 'INPUT' : 'IDLE');
    }
  }

  /** Starts a film sequence for one or more countries, in the given order. */
  start(countries: CountryIndexEntry[]): void {
    if (!countries.length) return;
    this.queue = [...countries];
    this.total = countries.length;
    this.done = 0;
    this.current = null;
    this.resetTween = null;
    this.transition = null;
    this.labelOpacity = 0;
    this.scene.land.setActive(null);
    this.scene.land.setIntensity(0);
    this.scene.label.hide();
    // Freeze the idle spin for a calm frame before anything moves.
    this.setPhase('PAUSE_BEFORE_ACTION', TIMING.pauseBeforeAction);
  }

  /** Returns to the initial wide shot and resumes the idle rotation. */
  reset(): void {
    this.queue = [];
    this.current = null;
    this.total = 0;
    this.done = 0;
    this.transition = null;
    this.phaseDuration = 0;
    this.phaseElapsed = 0;
    this.labelOpacity = 0;
    this.scene.land.setIntensity(0);
    this.scene.land.setActive(null);
    this.scene.label.hide();
    this.resetTween = {
      elapsed: 0,
      duration: 750,
      fromDistance: this.scene.rig.distance,
      fromQuaternion: this.scene.globe.quaternion.clone(),
    };
    this.setPhase('INPUT');
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;

    if (this.resetTween) {
      const tween = this.resetTween;
      tween.elapsed += dtMs;
      const t = clamp01(tween.elapsed / tween.duration);
      const eased = cameraEase(t);
      this.scene.rig.distance = lerp(tween.fromDistance, this.scene.rig.getProfile().idleDistance, eased);
      this.scene.globe.quaternion.slerpQuaternions(tween.fromQuaternion, new Quaternion(), eased);
      if (t >= 1) this.resetTween = null;
      return;
    }

    if (this.phase === 'IDLE' || this.phase === 'INPUT') {
      // Slow, continuous spin around the globe's vertical axis.
      const spin = new Quaternion().setFromAxisAngle(AXIS_Y, IDLE_SPIN_SPEED * dt);
      this.scene.globe.quaternion.premultiply(spin);
      return;
    }

    if (this.phase === 'HOLD' || this.phase === 'ERROR') return;

    this.phaseElapsed += dtMs;
    const raw = this.phaseDuration > 0 ? clamp01(this.phaseElapsed / this.phaseDuration) : 1;

    switch (this.phase) {
      case 'PAUSE_BEFORE_ACTION':
        // Deliberately nothing: the frame stays calm for the edit.
        if (raw >= 1) this.beginNextCountry();
        break;
      case 'PREPARE_GLOBE':
        this.updatePrepare(raw);
        if (raw >= 1) this.setPhase('ORIENT_TO_COUNTRY', TIMING.orientToCountry);
        break;
      case 'ORIENT_TO_COUNTRY':
        this.updateOrient(raw);
        if (raw >= 1) this.setPhase('ZOOM_TO_COUNTRY', TIMING.zoomToCountry);
        break;
      case 'ZOOM_TO_COUNTRY':
        this.updateZoom(raw);
        if (raw >= 1) this.finishCountry();
        break;
      case 'SEQUENCE_PAUSE':
        if (raw >= 1) this.beginNextCountry();
        break;
      default:
        break;
    }
  }

  private setPhase(phase: AnimationPhase, duration = 0): void {
    this.phase = phase;
    this.phaseDuration = duration;
    this.phaseElapsed = 0;
    this.callbacks.onStatus?.(this.getStatus());
  }

  private beginNextCountry(): void {
    const country = this.queue.shift();
    if (!country) {
      this.setPhase('HOLD');
      this.callbacks.onSequenceComplete?.();
      return;
    }
    this.current = country;
    this.preparedCurrent = false;

    const profile = this.scene.rig.getProfile();
    const targetQuaternion = orientationForDirection(latLonToDirection(country.lat, country.lon));
    this.transition = {
      startQuaternion: this.scene.globe.quaternion.clone(),
      targetQuaternion,
      startDistance: this.scene.rig.distance,
      // Pull back a little further than the idle shot so the globe is fully recognisable.
      pullDistance: Math.min(profile.idleDistance * 1.06, profile.maxDistance),
      endDistance: this.scene.computeZoomDistance(country),
      startIntensity: this.scene.land.getIntensity(),
    };

    // Warm the flag so the card is ready the moment zooming starts.
    void this.scene.label.preload(country);
    this.setPhase('PREPARE_GLOBE', TIMING.prepareGlobe);
  }

  private updatePrepare(t: number): void {
    const trans = this.transition;
    if (!trans) return;
    const eased = fadeEase(t);
    this.scene.rig.distance = lerp(trans.startDistance, trans.pullDistance, cameraEase(t));
    // Fade out any previous accent and label while the camera pulls back.
    this.scene.land.setIntensity(lerp(trans.startIntensity, 0, eased));
    this.labelOpacity = lerp(this.labelOpacity, 0, eased);
    this.scene.label.setOpacity(this.labelOpacity);
    if (t >= 1) {
      this.scene.land.setActive(null);
      this.scene.land.setIntensity(0);
    }
  }

  private updateOrient(t: number): void {
    const trans = this.transition;
    if (!trans || !this.current) return;
    const eased = globeEase(t);
    this.scene.globe.quaternion.slerpQuaternions(trans.startQuaternion, trans.targetQuaternion, eased);
    if (!this.preparedCurrent) {
      // Swap in the new country's accent and label content while invisible.
      this.preparedCurrent = true;
      const country = this.scene.land.getCountry(this.current.id);
      if (country) this.scene.land.setActive(country);
      void this.scene.label.show(this.current);
      this.labelOpacity = 0;
      this.scene.label.setOpacity(0);
    }
  }

  private updateZoom(t: number): void {
    const trans = this.transition;
    if (!trans) return;
    const eased = fadeEase(t);
    this.scene.rig.distance = lerp(trans.pullDistance, trans.endDistance, cameraEase(t));
    this.scene.land.setIntensity(eased);
    this.labelOpacity = eased;
    this.scene.label.setOpacity(eased);
  }

  private finishCountry(): void {
    this.done += 1;
    this.scene.land.setIntensity(1);
    this.scene.label.setOpacity(1);
    this.labelOpacity = 1;
    if (this.queue.length) {
      this.setPhase('SEQUENCE_PAUSE', TIMING.sequencePause);
    } else {
      this.setPhase('HOLD');
      this.callbacks.onSequenceComplete?.();
    }
  }
}