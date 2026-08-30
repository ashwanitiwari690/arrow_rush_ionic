import { Injectable, inject } from '@angular/core';
import { SettingsService } from './settings.service';

export type SoundKey =
  | 'move'
  | 'blocked'
  | 'levelComplete'
  | 'buttonClick'
  | 'reward'
  | 'coin'
  | 'failure';

interface Tone {
  frequency: number;
  durationMs: number;
  type: OscillatorType;
}

/**
 * Synthesizes short tones with the Web Audio API instead of shipping .mp3/.wav assets —
 * keeps the APK small and avoids sourcing licensed sound effects. Swap this for sample
 * playback later without touching call sites; every screen only ever calls `play(key)`.
 */
@Injectable({ providedIn: 'root' })
export class SoundService {
  private readonly settingsService = inject(SettingsService);
  private audioContext: AudioContext | null = null;

  private readonly tones: Record<SoundKey, Tone[]> = {
    move: [{ frequency: 520, durationMs: 90, type: 'sine' }],
    blocked: [{ frequency: 160, durationMs: 120, type: 'square' }],
    buttonClick: [{ frequency: 700, durationMs: 40, type: 'sine' }],
    coin: [
      { frequency: 880, durationMs: 60, type: 'sine' },
      { frequency: 1320, durationMs: 90, type: 'sine' },
    ],
    reward: [
      { frequency: 660, durationMs: 80, type: 'sine' },
      { frequency: 880, durationMs: 80, type: 'sine' },
      { frequency: 1100, durationMs: 140, type: 'sine' },
    ],
    levelComplete: [
      { frequency: 523, durationMs: 90, type: 'sine' },
      { frequency: 659, durationMs: 90, type: 'sine' },
      { frequency: 784, durationMs: 90, type: 'sine' },
      { frequency: 1046, durationMs: 160, type: 'sine' },
    ],
    failure: [
      { frequency: 300, durationMs: 160, type: 'sawtooth' },
      { frequency: 180, durationMs: 220, type: 'sawtooth' },
    ],
  };

  play(key: SoundKey): void {
    if (!this.settingsService.settings().soundEnabled) return;

    const ctx = this.ensureContext();
    if (!ctx) return;

    let startAt = ctx.currentTime;
    for (const tone of this.tones[key]) {
      this.playTone(ctx, tone, startAt);
      startAt += tone.durationMs / 1000;
    }
  }

  private playTone(ctx: AudioContext, tone: Tone, startAt: number): void {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = tone.type;
    oscillator.frequency.setValueAtTime(tone.frequency, startAt);

    const durationSec = tone.durationMs / 1000;
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.2, startAt + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationSec);

    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + durationSec);
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtor = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AudioCtor) return null;

    if (!this.audioContext) {
      this.audioContext = new AudioCtor();
    }
    if (this.audioContext.state === 'suspended') {
      void this.audioContext.resume();
    }
    return this.audioContext;
  }
}
