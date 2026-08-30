import { Injectable, effect, inject } from '@angular/core';
import { SettingsService } from './settings.service';

export type MusicTrack = 'menu' | 'gameplay';

interface ChordStep {
  frequencies: number[];
  beats: number;
}

// Simple looping progressions — slower, softer pad for menus; a touch brighter/faster for
// gameplay so it doesn't feel identical to the menu loop. Minor triads keep both calm.
const MENU_PROGRESSION: ChordStep[] = [
  { frequencies: [220, 261.63, 329.63], beats: 4 }, // A minor
  { frequencies: [174.61, 220, 261.63], beats: 4 }, // F major
  { frequencies: [196, 246.94, 293.66], beats: 4 }, // G major
  { frequencies: [220, 261.63, 329.63], beats: 4 }, // A minor
];

const GAMEPLAY_PROGRESSION: ChordStep[] = [
  { frequencies: [246.94, 293.66, 369.99], beats: 3 }, // B minor-ish pad
  { frequencies: [220, 277.18, 329.63], beats: 3 },
  { frequencies: [196, 246.94, 293.66], beats: 3 },
  { frequencies: [220, 261.63, 329.63], beats: 3 },
];

const BEAT_SECONDS = 0.7;

/**
 * Ambient background music synthesized with the Web Audio API — same reasoning as
 * SoundService: no .mp3 assets to ship, so APK size stays small and there's no licensed
 * track to source. Loops a short chord progression with slow attack/release envelopes so
 * it reads as a soft pad rather than a beeping loop. Browsers block audio before a user
 * gesture, so `start()`/`unlock()` are safe to call eagerly — they just stay silent until
 * the first tap resumes the AudioContext.
 */
@Injectable({ providedIn: 'root' })
export class MusicService {
  private readonly settingsService = inject(SettingsService);

  private audioContext: AudioContext | null = null;
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
    if (!ctx) return;

    const progression = track === 'menu' ? MENU_PROGRESSION : GAMEPLAY_PROGRESSION;
    const step = progression[this.stepIndex % progression.length];
    const durationSec = step.beats * BEAT_SECONDS;

    this.playChord(ctx, step.frequencies, durationSec);

    this.stepIndex++;
    this.stepTimer = setTimeout(() => {
      if (this.currentTrack === track) this.playLoop(track);
    }, durationSec * 1000);
  }

  private playChord(ctx: AudioContext, frequencies: number[], durationSec: number): void {
    if (!this.masterGain) return;
    const now = ctx.currentTime;
    const attack = 0.6;
    const release = 0.8;

    for (const frequency of frequencies) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.05, now + attack);
      gain.gain.setValueAtTime(0.05, now + durationSec - release);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

      oscillator.connect(gain).connect(this.masterGain);
      oscillator.start(now);
      oscillator.stop(now + durationSec + 0.05);
    }
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtor = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AudioCtor) return null;

    if (!this.audioContext) {
      this.audioContext = new AudioCtor();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = 1;
      this.masterGain.connect(this.audioContext.destination);
    }
    if (this.audioContext.state === 'suspended') {
      void this.audioContext.resume();
    }
    return this.audioContext;
  }
}
