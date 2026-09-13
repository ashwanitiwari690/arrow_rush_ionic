import { Injectable, effect, inject } from '@angular/core';
import { SettingsService } from './settings.service';

export type MusicTrack = 'menu' | 'gameplay';

interface ChordStep {
  /** Pad voicing: [root, third, fifth]. */
  frequencies: number[];
  beats: number;
}

// Eight-bar progressions (twice the old four-chord loop) so the ear takes longer to notice
// the repeat; minor/major mix keeps both calm without ever feeling static.
const MENU_PROGRESSION: ChordStep[] = [
  { frequencies: [220, 261.63, 329.63], beats: 4 }, // A minor
  { frequencies: [174.61, 220, 261.63], beats: 4 }, // F major
  { frequencies: [196, 246.94, 293.66], beats: 4 }, // G major
  { frequencies: [164.81, 196, 246.94], beats: 4 }, // E minor
  { frequencies: [220, 261.63, 329.63], beats: 4 }, // A minor
  { frequencies: [174.61, 220, 261.63], beats: 4 }, // F major
  { frequencies: [196, 246.94, 293.66], beats: 4 }, // G major
  { frequencies: [220, 261.63, 329.63], beats: 4 }, // A minor (resolve)
];

const GAMEPLAY_PROGRESSION: ChordStep[] = [
  { frequencies: [246.94, 293.66, 369.99], beats: 3 }, // B minor-ish pad
  { frequencies: [220, 277.18, 329.63], beats: 3 },
  { frequencies: [196, 246.94, 293.66], beats: 3 },
  { frequencies: [220, 261.63, 329.63], beats: 3 },
  { frequencies: [261.63, 329.63, 392.0], beats: 3 }, // brighter lift for variety
  { frequencies: [220, 277.18, 329.63], beats: 3 },
  { frequencies: [196, 246.94, 293.66], beats: 3 },
  { frequencies: [220, 261.63, 329.63], beats: 3 },
];

const BEAT_SECONDS = 0.7;
const ARP_STEPS_PER_CHORD = 4;
// Which chord tone (by index into `frequencies`) plays on each arpeggio step, one octave up.
const ARP_PATTERN = [0, 1, 2, 1];

/**
 * Ambient background music synthesized with the Web Audio API — same reasoning as
 * SoundService: no .mp3 assets to ship, so APK size stays small and there's no licensed
 * track to source. Each chord now layers a chorused pad, a sub-octave bass note, and a
 * short plucked arpeggio, through a shared lowpass filter and a limiter — fuller and less
 * repetitive than a single held sine-wave triad, and loud without clipping. Browsers block
 * audio before a user gesture, so `start()`/`unlock()` are safe to call eagerly — they just
 * stay silent until the first tap resumes the AudioContext.
 */
@Injectable({ providedIn: 'root' })
export class MusicService {
  private readonly settingsService = inject(SettingsService);

  private audioContext: AudioContext | null = null;
  private toneBus: BiquadFilterNode | null = null;
  private masterGain: GainNode | null = null;
  private currentTrack: MusicTrack | null = null;
  private stepTimer: ReturnType<typeof setTimeout> | null = null;
  private stepIndex = 0;

  constructor() {
    // Reacts to the Settings "Music" toggle live, including turning a loop already in
    // progress on/off, without any page needing to call back into this service directly.
    effect(() => {
      const enabled = this.settingsService.settings().musicEnabled;
      if (!enabled) {
        this.clearTimer();
      } else if (this.currentTrack) {
        this.playLoop(this.currentTrack);
      }
    });
  }

  start(track: MusicTrack): void {
    if (this.currentTrack === track) return;
    this.currentTrack = track;
    this.stepIndex = 0;
    this.clearTimer();

    if (this.settingsService.settings().musicEnabled) {
      this.playLoop(track);
    }
  }

  stop(): void {
    this.currentTrack = null;
    this.clearTimer();
  }

  /** Call once on the first user gesture to satisfy autoplay policies. */
  unlock(): void {
    this.ensureContext();
  }

  private clearTimer(): void {
    if (this.stepTimer) {
      clearTimeout(this.stepTimer);
      this.stepTimer = null;
    }
  }

  private playLoop(track: MusicTrack): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.toneBus) return;

    const progression = track === 'menu' ? MENU_PROGRESSION : GAMEPLAY_PROGRESSION;
    const step = progression[this.stepIndex % progression.length];
    const durationSec = step.beats * BEAT_SECONDS;

    this.playPad(ctx, this.toneBus, step.frequencies, durationSec);
    this.playBass(ctx, this.toneBus, step.frequencies[0], durationSec);
    this.playArpeggio(ctx, this.toneBus, step.frequencies, durationSec);

    this.stepIndex++;
    this.stepTimer = setTimeout(() => {
      if (this.currentTrack === track) this.playLoop(track);
    }, durationSec * 1000);
  }

  /** Warm pad: two slightly-detuned oscillators per chord tone (a cheap chorus effect) so
   * the chord sounds full instead of three thin sine beeps stacked on top of each other. */
  private playPad(ctx: AudioContext, out: AudioNode, frequencies: number[], durationSec: number): void {
    const now = ctx.currentTime;
    const attack = 0.6;
    const release = 0.8;
    const peak = 0.14;

    for (const frequency of frequencies) {
      for (const detune of [-6, 6]) {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, now);
        oscillator.detune.setValueAtTime(detune, now);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(peak, now + attack);
        gain.gain.setValueAtTime(peak, now + durationSec - release);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

        oscillator.connect(gain).connect(out);
        oscillator.start(now);
        oscillator.stop(now + durationSec + 0.05);
      }
    }
  }

  /** One octave below the chord root — gives the loop a floor to sit on instead of the
   * pad floating with nothing underneath it. */
  private playBass(ctx: AudioContext, out: AudioNode, rootFrequency: number, durationSec: number): void {
    const now = ctx.currentTime;
    const attack = 0.15;
    const release = 0.5;

    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(rootFrequency / 2, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.24, now + attack);
    gain.gain.setValueAtTime(0.24, now + durationSec - release);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    oscillator.connect(gain).connect(out);
    oscillator.start(now);
    oscillator.stop(now + durationSec + 0.05);
  }

  /** Short plucked notes cycling through the chord tones (one octave up) — breaks up the
   * loop with rhythmic movement instead of a held pad repeating unchanged every bar. */
  private playArpeggio(ctx: AudioContext, out: AudioNode, frequencies: number[], durationSec: number): void {
    const stepSec = durationSec / ARP_STEPS_PER_CHORD;

    for (let i = 0; i < ARP_STEPS_PER_CHORD; i++) {
      const startAt = ctx.currentTime + i * stepSec;
      const frequency = frequencies[ARP_PATTERN[i % ARP_PATTERN.length] % frequencies.length] * 2;
      const noteDur = stepSec * 0.8;

      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(frequency, startAt);

      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.13, startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + noteDur);

      oscillator.connect(gain).connect(out);
      oscillator.start(startAt);
      oscillator.stop(startAt + noteDur + 0.05);
    }
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtor = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AudioCtor) return null;

    if (!this.audioContext) {
      this.audioContext = new AudioCtor();

      // Every layer feeds this lowpass first (softens harsh highs so the pad reads as
      // warm rather than beeping), then a limiter (keeps three-plus simultaneous layers
      // from clipping), then a final makeup gain — this is what lets the mix run louder
      // than the old single-layer version without distorting.
      this.toneBus = this.audioContext.createBiquadFilter();
      this.toneBus.type = 'lowpass';
      this.toneBus.frequency.value = 2400;

      const limiter = this.audioContext.createDynamicsCompressor();
      limiter.threshold.value = -14;
      limiter.knee.value = 18;
      limiter.ratio.value = 6;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;

      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = 1.3;

      this.toneBus.connect(limiter);
      limiter.connect(this.masterGain);
      this.masterGain.connect(this.audioContext.destination);
    }
    if (this.audioContext.state === 'suspended') {
      void this.audioContext.resume();
    }
    return this.audioContext;
  }
}
