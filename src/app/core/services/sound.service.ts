import { DestroyRef, Injectable, inject } from '@angular/core';
import { AudioService } from './audio.service';
import { SettingsService } from './settings.service';

export type SoundKey = 'move' | 'blocked' | 'levelComplete' | 'buttonClick' | 'reward' | 'coin' | 'failure'
  | 'hint' | 'undo' | 'shuffle' | 'extraTime' | 'countdown';

interface Tone {
  frequency: number;
  endFrequency?: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
}

const SOUNDS: Record<SoundKey, Tone[]> = {
  move: [{ frequency: 480, endFrequency: 960, duration: 0.085, type: 'triangle', gain: 0.22 }],
  blocked: [{ frequency: 150, endFrequency: 90, duration: 0.13, type: 'triangle', gain: 0.3 }],
  buttonClick: [{ frequency: 680, endFrequency: 520, duration: 0.035, gain: 0.16 }],
  coin: [{ frequency: 988, duration: 0.06 }, { frequency: 1319, duration: 0.16 }],
  reward: [{ frequency: 659, duration: 0.08 }, { frequency: 880, duration: 0.08 }, { frequency: 1319, duration: 0.24 }],
  levelComplete: [
    { frequency: 523, duration: 0.09 }, { frequency: 659, duration: 0.09 },
    { frequency: 784, duration: 0.09 }, { frequency: 1047, duration: 0.36 },
  ],
  failure: [{ frequency: 392, duration: 0.16, type: 'triangle' }, { frequency: 294, duration: 0.2 }, { frequency: 196, duration: 0.32 }],
  hint: [{ frequency: 784, duration: 0.09 }, { frequency: 1175, duration: 0.25 }],
  undo: [{ frequency: 880, endFrequency: 330, duration: 0.19, type: 'triangle' }],
  shuffle: [{ frequency: 440, duration: 0.055 }, { frequency: 659, duration: 0.055 }, { frequency: 554, duration: 0.055 }, { frequency: 880, duration: 0.14 }],
  extraTime: [{ frequency: 523, duration: 0.09 }, { frequency: 784, duration: 0.09 }, { frequency: 1047, duration: 0.2 }],
  countdown: [{ frequency: 880, duration: 0.045, gain: 0.1 }],
};

@Injectable({ providedIn: 'root' })
export class SoundService {
  private readonly settings = inject(SettingsService).settings;
  private readonly audio = inject(AudioService);
  private readonly voices = new Set<OscillatorNode>();
  private readonly lastPlayed = new Map<SoundKey, number>();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      for (const voice of this.voices) voice.stop();
      this.voices.clear();
    });
  }

  play(key: SoundKey): void {
    const settings = this.settings();
    if (!settings.soundEnabled || settings.soundVolume === 0 || !this.audio.appActive()) return;
    const now = performance.now();
    if (now - (this.lastPlayed.get(key) ?? -Infinity) < 35) return;
    const ctx = this.audio.getContext();
    const output = this.audio.output('sound');
    if (!ctx || !output) return;
    this.lastPlayed.set(key, now);
    this.audio.unlock();

    let start = ctx.currentTime + 0.005;
    for (const tone of SOUNDS[key]) {
      if (this.voices.size >= 24) break;
      const oscillator = ctx.createOscillator();
      const envelope = ctx.createGain();
      oscillator.type = tone.type ?? 'sine';
      oscillator.frequency.setValueAtTime(tone.frequency, start);
      if (tone.endFrequency) oscillator.frequency.exponentialRampToValueAtTime(tone.endFrequency, start + tone.duration);
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(tone.gain ?? 0.23, start + 0.005);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration);
      oscillator.connect(envelope).connect(output);
      this.voices.add(oscillator);
      oscillator.onended = () => {
        oscillator.disconnect();
        envelope.disconnect();
        this.voices.delete(oscillator);
      };
      oscillator.start(start);
      oscillator.stop(start + tone.duration + 0.01);
      start += tone.duration * 0.85;
    }
  }
}
