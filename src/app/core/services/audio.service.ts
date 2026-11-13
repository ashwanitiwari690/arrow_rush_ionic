import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { SettingsService } from './settings.service';

// The synthesized notes are quiet even with the preference sliders at 100%.
// Boost the mix here so saved volume preferences and mute still work normally.
const SOUND_OUTPUT_GAIN = 3;
const MUSIC_OUTPUT_GAIN = 5;

/** One device context, with independent buses for effects and background music. */
@Injectable({ providedIn: 'root' })
export class AudioService {
  private readonly settings = inject(SettingsService).settings;
  private readonly destroyRef = inject(DestroyRef);
  private context: AudioContext | null = null;
  private soundBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private readonly _appActive = signal(typeof document === 'undefined' || !document.hidden);
  readonly appActive = this._appActive.asReadonly();

  constructor() {
    effect(() => {
      const settings = this.settings();
      const ctx = this.context;
      if (!ctx) return;
      this.soundBus?.gain.setTargetAtTime(settings.soundEnabled ? settings.soundVolume * SOUND_OUTPUT_GAIN : 0, ctx.currentTime, 0.02);
      this.musicBus?.gain.setTargetAtTime(settings.musicEnabled ? settings.musicVolume * MUSIC_OUTPUT_GAIN : 0, ctx.currentTime, 0.04);
    });
    if (typeof document !== 'undefined') {
      const onVisibility = () => this.setAppActive(!document.hidden);
      document.addEventListener('visibilitychange', onVisibility);
      this.destroyRef.onDestroy(() => document.removeEventListener('visibilitychange', onVisibility));
    }
    this.destroyRef.onDestroy(() => { void this.context?.close().catch(() => undefined); });
  }

  getContext(): AudioContext | null {
    if (this.context) return this.context;
    if (typeof window === 'undefined') return null;
    const AudioCtor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return null;
    try {
      const ctx = new AudioCtor({ latencyHint: 'interactive' });
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.12;

      // Leave normal samples unchanged and soften only the loudest peaks when
      // several effects overlap the music. The final output stays below full scale.
      const safety = ctx.createWaveShaper();
      const curve = new Float32Array(2049);
      for (let i = 0; i < curve.length; i++) {
        const input = i * 2 / (curve.length - 1) - 1;
        const magnitude = Math.abs(input);
        const limited = magnitude <= 0.8 ? magnitude : 0.8 + 0.18 * Math.tanh((magnitude - 0.8) / 0.18);
        curve[i] = Math.sign(input) * limited;
      }
      safety.curve = curve;
      limiter.connect(safety).connect(ctx.destination);
      this.soundBus = ctx.createGain();
      this.musicBus = ctx.createGain();
      const settings = this.settings();
      this.soundBus.gain.value = settings.soundEnabled ? settings.soundVolume * SOUND_OUTPUT_GAIN : 0;
      this.musicBus.gain.value = settings.musicEnabled ? settings.musicVolume * MUSIC_OUTPUT_GAIN : 0;
      this.soundBus.connect(limiter);
      this.musicBus.connect(limiter);
      this.context = ctx;
      if (!this.appActive()) void ctx.suspend().catch(() => undefined);
      return ctx;
    } catch {
      return null;
    }
  }

  output(channel: 'sound' | 'music'): GainNode | null {
    if (!this.getContext()) return null;
    return channel === 'sound' ? this.soundBus : this.musicBus;
  }

  unlock(): void {
    const ctx = this.getContext();
    if (ctx && ctx.state !== 'running' && this.appActive()) void ctx.resume().catch(() => undefined);
  }

  setAppActive(active: boolean): void {
    this._appActive.set(active);
    if (!active) void this.context?.suspend().catch(() => undefined);
    else if (this.context) this.unlock();
  }
}
