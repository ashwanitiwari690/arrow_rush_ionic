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
  endFrequency?: number;
  durationMs: number;
  type: OscillatorType;
  gain?: number;
}

/**
 * Synthesizes punchy, crisp sound effects with the Web Audio API.
 * Uses rich harmonics (triangle/sawtooth/sine), high gain levels, and a dedicated
 * limiter/master compression chain so all sound effects play with high volume and
 * clarity on mobile device speakers without clipping.
 */
@Injectable({ providedIn: 'root' })
export class SoundService {
  private readonly settingsService = inject(SettingsService);
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;

  private readonly tones: Record<SoundKey, Tone[]> = {
    move: [
      { frequency: 460, endFrequency: 680, durationMs: 110, type: 'triangle', gain: 0.92 },
    ],
    blocked: [
      { frequency: 220, endFrequency: 140, durationMs: 140, type: 'sawtooth', gain: 0.88 },
    ],
    buttonClick: [
      { frequency: 780, endFrequency: 600, durationMs: 45, type: 'triangle', gain: 0.85 },
    ],
    coin: [
      { frequency: 988, durationMs: 70, type: 'sine', gain: 0.92 },
      { frequency: 1318, durationMs: 120, type: 'sine', gain: 0.95 },
    ],
    reward: [
      { frequency: 659.25, durationMs: 90, type: 'triangle', gain: 0.88 },
      { frequency: 880, durationMs: 90, type: 'triangle', gain: 0.92 },
      { frequency: 1318.51, durationMs: 180, type: 'triangle', gain: 0.96 },
    ],
    levelComplete: [
      { frequency: 523.25, durationMs: 100, type: 'triangle', gain: 0.88 },
      { frequency: 659.25, durationMs: 100, type: 'triangle', gain: 0.90 },
      { frequency: 783.99, durationMs: 100, type: 'triangle', gain: 0.94 },
      { frequency: 1046.50, durationMs: 220, type: 'triangle', gain: 0.96 },
    ],
    failure: [
      { frequency: 320, durationMs: 180, type: 'sawtooth', gain: 0.88 },
      { frequency: 210, durationMs: 260, type: 'sawtooth', gain: 0.88 },
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
    if (tone.endFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(
        tone.endFrequency,
        startAt + tone.durationMs / 1000
      );
    }

    const durationSec = tone.durationMs / 1000;
    const peakGain = tone.gain ?? 0.88;

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(peakGain, startAt + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationSec);

    const destination = this.limiter ?? ctx.destination;
    oscillator.connect(gain).connect(destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + durationSec + 0.02);
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtor = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AudioCtor) return null;

    if (!this.audioContext) {
      this.audioContext = new AudioCtor();

      // Master compression and gain stage to ensure loud, punchy playback without distortion
      this.limiter = this.audioContext.createDynamicsCompressor();
      this.limiter.threshold.value = -8;
      this.limiter.knee.value = 12;
      this.limiter.ratio.value = 4;
      this.limiter.attack.value = 0.002;
      this.limiter.release.value = 0.15;

      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = 1.35;

      this.limiter.connect(this.masterGain);
      this.masterGain.connect(this.audioContext.destination);
    }

    if (this.audioContext.state === 'suspended') {
      void this.audioContext.resume();
    }
    return this.audioContext;
  }
}
