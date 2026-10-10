import { Injectable, effect, inject } from '@angular/core';
import { SettingsService } from './settings.service';

export type MusicTrack = 'menu' | 'gameplay';

// Note frequencies (Hz) for equal temperament tuning
const C2 = 65.41;
const F2 = 87.31;
const G2 = 98.0;
const A2 = 110.0;
const Bb2 = 116.54;
const C3 = 130.81;
const D3 = 146.83;
const E3 = 164.81;
const F3 = 174.61;
const G3 = 196.0;
const A3 = 220.0;
const Bb3 = 233.08;
const B3 = 246.94;
const C4 = 261.63;
const D4 = 293.66;
const E4 = 329.63;
const F4 = 349.23;
const G4 = 392.0;
const A4 = 440.0;
const Bb4 = 466.16;
const B4 = 493.88;
const C5 = 523.25;
const D5 = 587.33;
const E5 = 659.25;
const F5 = 698.46;
const G5 = 783.99;
const A5 = 880.0;

interface TrackConfig {
  stepIntervalMs: number;
  stepsCount: number;
  melody: (number | null)[];
  chords: (number[] | null)[];
  bass: (number | null)[];
  pulse: boolean[];
}

/**
 * Menu Track: "Neon Horizon"
 * Warm, uplifting, catchy casual game melody in C Major (Cmaj7 -> Am7 -> Fmaj7 -> G7).
 * Sounds like a cheerful, relaxing arcade puzzle theme (soft kalimba chimes + warm Rhodes chords + gentle bass).
 */
const MENU_TRACK: TrackConfig = {
  stepIntervalMs: 140, // ~107 BPM (16th notes)
  stepsCount: 32,
  melody: [
    E5, null, G5, null, E5, D5, C5, null,
    E5, null, D5, null, G4, null, A4, null,
    C5, null, D5, null, E5, G5, A5, null,
    G5, null, E5, D5, C5, null, null, null,
  ],
  chords: [
    [C4, E4, G4, B4], null, null, null, null, null, [C4, E4, G4], null,
    [A3, C4, E4, G4], null, null, null, null, null, [A3, C4, E4], null,
    [F3, A3, C4, E4], null, null, null, null, null, [F3, A3, C4], null,
    [G3, B3, D4, F4], null, null, null, null, null, [G3, B3, D4], null,
  ],
  bass: [
    C3, null, null, null, C3, null, G2, null,
    A2, null, null, null, A2, null, E3, null,
    F2, null, null, null, F2, null, C3, null,
    G2, null, null, null, G2, null, B2_freq(123.47), null,
  ],
  pulse: [
    true, false, false, false, true, false, false, false,
    true, false, false, false, true, false, false, false,
    true, false, false, false, true, false, false, false,
    true, false, false, false, true, false, false, false,
  ],
};

function B2_freq(n: number): number {
  return n;
}

/**
 * Gameplay Track: "Arrow Flow"
 * Upbeat, focused, rhythmic puzzle groove in D minor (Dm -> Bb -> F -> C).
 * Energetic, satisfying, driving pulse designed for puzzle concentration and flow state.
 */
const GAMEPLAY_TRACK: TrackConfig = {
  stepIntervalMs: 125, // ~120 BPM (16th notes)
  stepsCount: 32,
  melody: [
    D5, F5, A5, F5, D5, F5, E5, C5,
    D5, F5, Bb4, D5, F5, D5, C5, A4,
    F4, A4, C5, A4, F5, E5, D5, C5,
    D5, null, E5, null, F5, E5, D5, null,
  ],
  chords: [
    [D4, F4, A4], null, null, null, [D4, F4], null, null, null,
    [Bb3, D4, F4], null, null, null, [Bb3, D4], null, null, null,
    [F3, A3, C4], null, null, null, [F3, A3], null, null, null,
    [C4, E4, G4], null, null, null, [C4, E4], null, null, null,
  ],
  bass: [
    D3, null, D3, null, null, D3, null, null,
    Bb2, null, Bb2, null, null, Bb2, null, null,
    F2, null, F2, null, null, F2, null, null,
    C3, null, C3, null, null, C3, null, null,
  ],
  pulse: [
    true, false, true, false, true, false, true, false,
    true, false, true, false, true, false, true, false,
    true, false, true, false, true, false, true, false,
    true, false, true, false, true, false, true, false,
  ],
};

/**
 * Procedural soundtrack synthesizer for Arrow Rush.
 * Generates custom, catchy, pleasing puzzle-game music (melodic kalimba chimes,
 * warm electric-piano chords, bouncy synth bass, and gentle rhythm pulse)
 * at a balanced, comfortable background volume.
 */
@Injectable({ providedIn: 'root' })
export class MusicService {
  private readonly settingsService = inject(SettingsService);

  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;

  private currentTrack: MusicTrack | null = null;
  private stepTimer: ReturnType<typeof setInterval> | null = null;
  private currentStep = 0;

  // Comfortable background music volume level
  private readonly musicVolume = 0.36;

  constructor() {
    effect(() => {
      const enabled = this.settingsService.settings().musicEnabled;
      if (!enabled) {
        this.stopTimer();
      } else if (this.currentTrack) {
        this.restartTrack();
      }
    });
  }

  start(track: MusicTrack): void {
    if (this.currentTrack === track && this.stepTimer) return;
    this.currentTrack = track;
    this.currentStep = 0;
    this.stopTimer();

    if (this.settingsService.settings().musicEnabled) {
      this.restartTrack();
    }
  }

  stop(): void {
    this.currentTrack = null;
    this.stopTimer();
  }

  unlock(): void {
    const ctx = this.ensureContext();
    if (ctx?.state === 'suspended') {
      void ctx.resume();
    }
    if (this.currentTrack && !this.stepTimer && this.settingsService.settings().musicEnabled) {
      this.restartTrack();
    }
  }

  private stopTimer(): void {
    if (this.stepTimer) {
      clearInterval(this.stepTimer);
      this.stepTimer = null;
    }
  }

  private restartTrack(): void {
    this.stopTimer();
    const config = this.currentTrack === 'gameplay' ? GAMEPLAY_TRACK : MENU_TRACK;

    const tick = () => {
      if (!this.settingsService.settings().musicEnabled) return;
      const ctx = this.ensureContext();
      if (!ctx) return;

      const step = this.currentStep % config.stepsCount;
      this.currentStep++;

      const now = ctx.currentTime;

      // 1. Play melody chime/pluck
      const noteFreq = config.melody[step];
      if (noteFreq) {
        this.playChime(ctx, noteFreq, now);
      }

      // 2. Play warm chord pad
      const chord = config.chords[step];
      if (chord) {
        this.playChord(ctx, chord, now, (config.stepIntervalMs * 3.5) / 1000);
      }

      // 3. Play bass groove
      const bassFreq = config.bass[step];
      if (bassFreq) {
        this.playBass(ctx, bassFreq, now, (config.stepIntervalMs * 1.8) / 1000);
      }

      // 4. Subtle percussion pulse
      if (config.pulse[step]) {
        this.playPulse(ctx, now);
      }
    };

    tick();
    this.stepTimer = setInterval(tick, config.stepIntervalMs);
  }

  /**
   * Warm kalimba / music-box chime pluck for the main melody.
   * Dual-harmonic sine with fast attack and natural acoustic-like decay.
   */
  private playChime(ctx: AudioContext, frequency: number, startAt: number): void {
    const out = this.filterNode ?? ctx.destination;

    // Fundamental note
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(frequency, startAt);

    gain1.gain.setValueAtTime(0.0001, startAt);
    gain1.gain.exponentialRampToValueAtTime(this.musicVolume * 0.42, startAt + 0.006);
    gain1.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.28);

    osc1.connect(gain1).connect(out);
    osc1.start(startAt);
    osc1.stop(startAt + 0.3);

    // Soft chime overtone (adds sparkle without harshness)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(frequency * 2, startAt);

    gain2.gain.setValueAtTime(0.0001, startAt);
    gain2.gain.exponentialRampToValueAtTime(this.musicVolume * 0.14, startAt + 0.004);
    gain2.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.12);

    osc2.connect(gain2).connect(out);
    osc2.start(startAt);
    osc2.stop(startAt + 0.15);
  }

  /**
   * Warm electric piano / Rhodes chord.
   */
  private playChord(ctx: AudioContext, frequencies: number[], startAt: number, duration: number): void {
    const out = this.filterNode ?? ctx.destination;
    const perVoiceGain = (this.musicVolume * 0.22) / frequencies.length;

    for (const freq of frequencies) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startAt);

      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(perVoiceGain, startAt + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

      osc.connect(gain).connect(out);
      osc.start(startAt);
      osc.stop(startAt + duration + 0.02);
    }
  }

  /**
   * Bouncy, punchy synth bassline.
   */
  private playBass(ctx: AudioContext, frequency: number, startAt: number, duration: number): void {
    const out = this.filterNode ?? ctx.destination;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, startAt);

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(this.musicVolume * 0.35, startAt + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

    osc.connect(gain).connect(out);
    osc.start(startAt);
    osc.stop(startAt + duration + 0.02);
  }

  /**
   * Very soft hi-hat/brush pulse to keep rhythm moving.
   */
  private playPulse(ctx: AudioContext, startAt: number): void {
    const out = this.filterNode ?? ctx.destination;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400, startAt);

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(this.musicVolume * 0.05, startAt + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.025);

    osc.connect(gain).connect(out);
    osc.start(startAt);
    osc.stop(startAt + 0.03);
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtor = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AudioCtor) return null;

    if (!this.audioContext) {
      this.audioContext = new AudioCtor();

      // Master bus: Filter to keep tone warm and pleasing
      this.filterNode = this.audioContext.createBiquadFilter();
      this.filterNode.type = 'lowpass';
      this.filterNode.frequency.value = 2800;

      // Gentle compressor to balance dynamics
      this.compressor = this.audioContext.createDynamicsCompressor();
      this.compressor.threshold.value = -12;
      this.compressor.knee.value = 12;
      this.compressor.ratio.value = 3;
      this.compressor.attack.value = 0.004;
      this.compressor.release.value = 0.15;

      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = 1.0;

      this.filterNode.connect(this.compressor);
      this.compressor.connect(this.masterGain);
      this.masterGain.connect(this.audioContext.destination);
    }

    if (this.audioContext.state === 'suspended') {
      void this.audioContext.resume();
    }
    return this.audioContext;
  }
}
