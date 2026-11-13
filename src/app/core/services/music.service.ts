import { DestroyRef, Injectable, effect, inject } from '@angular/core';
import { AudioService } from './audio.service';
import { SettingsService } from './settings.service';

export type MusicTrack = 'menu' | 'gameplay' | 'daily';

interface Arrangement {
  bpm: number;
  roots: number[];
  melody: (number | null)[];
  minor: boolean;
}

// Original eight-bar motifs: spacious menu, mellow puzzle groove, brighter daily challenge.
const TRACKS: Record<MusicTrack, Arrangement> = {
  menu: {
    bpm: 92, roots: [48, 45, 41, 43], minor: false,
    melody: [76, null, 79, null, 76, 74, 72, null, 76, null, 74, null, 67, null, 69, null,
      72, null, 74, null, 76, 79, 81, null, 79, null, 76, 74, 72, null, null, null],
  },
  gameplay: {
    bpm: 104, roots: [50, 46, 41, 48], minor: true,
    melody: [74, null, 77, null, 81, null, 77, null, 74, null, 77, null, 70, null, 72, null,
      69, null, 72, null, 77, null, 76, null, 74, null, 72, null, 69, null, null, null],
  },
  daily: {
    bpm: 120, roots: [45, 41, 48, 43], minor: true,
    melody: [76, 81, null, 79, 76, null, 72, null, 77, null, 81, 79, 77, null, 74, null,
      76, 79, null, 84, 79, null, 76, null, 74, null, 79, 77, 76, 74, 72, null],
  },
};

const frequency = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** Render each arrangement once; playback uses one looping source and no JS music timer. */
@Injectable({ providedIn: 'root' })
export class MusicService {
  private readonly audio = inject(AudioService);
  private readonly settings = inject(SettingsService).settings;
  private readonly buffers = new Map<MusicTrack, Promise<AudioBuffer>>();
  private source: AudioBufferSourceNode | null = null;
  private currentTrack: MusicTrack | null = null;
  private paused = false;
  private adPaused = false;
  private unlocked = false;
  private generation = 0;

  constructor() {
    effect(() => {
      const enabled = this.settings().musicEnabled;
      const active = this.audio.appActive();
      if (!enabled || !active) this.stopSource();
      else void this.playCurrent();
    });
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  start(track: MusicTrack): void {
    if (track !== this.currentTrack) {
      this.stopSource();
      this.currentTrack = track;
    }
    this.paused = false;
    void this.playCurrent();
  }

  stop(): void {
    this.currentTrack = null;
    this.paused = false;
    this.stopSource();
  }

  pause(): void {
    this.paused = true;
    this.stopSource();
  }

  resume(): void {
    this.paused = false;
    void this.playCurrent();
  }

  setAdPaused(paused: boolean): void {
    this.adPaused = paused;
    if (paused) this.stopSource();
    else void this.playCurrent();
  }

  unlock(): void {
    this.unlocked = true;
    this.audio.unlock();
    void this.playCurrent();
  }

  private async playCurrent(): Promise<void> {
    if (!this.unlocked || this.paused || this.adPaused || this.source || !this.currentTrack || !this.settings().musicEnabled || !this.audio.appActive()) return;
    const ctx = this.audio.getContext();
    const output = this.audio.output('music');
    if (!ctx || !output || typeof OfflineAudioContext === 'undefined') return;
    const track = this.currentTrack;
    const generation = ++this.generation;
    try {
      let rendered = this.buffers.get(track);
      if (!rendered) {
        rendered = this.renderTrack(track);
        this.buffers.set(track, rendered);
      }
      const buffer = await rendered;
      if (generation !== this.generation || this.paused || this.adPaused || !this.settings().musicEnabled || !this.audio.appActive()) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(output);
      source.start();
      this.source = source;
    } catch {
      this.buffers.delete(track);
    }
  }

  private stopSource(): void {
    ++this.generation;
    if (!this.source) return;
    this.source.stop();
    this.source.disconnect();
    this.source = null;
  }

  private async renderTrack(track: MusicTrack): Promise<AudioBuffer> {
    const config = TRACKS[track];
    const step = 60 / config.bpm / 2;
    const duration = step * 64;
    const ctx = new OfflineAudioContext(1, Math.ceil(duration * 22050), 22050);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2600;
    filter.connect(ctx.destination);
    const note = (midi: number, start: number, length: number, gain: number, type: OscillatorType = 'sine') => {
      const oscillator = ctx.createOscillator();
      const envelope = ctx.createGain();
      const end = Math.min(start + length, duration);
      oscillator.type = type;
      oscillator.frequency.value = frequency(midi);
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(gain, start + 0.008);
      envelope.gain.exponentialRampToValueAtTime(0.0001, end);
      oscillator.connect(envelope).connect(filter);
      oscillator.start(start);
      oscillator.stop(end);
    };
    for (let i = 0; i < 64; i++) {
      const start = i * step;
      const root = config.roots[Math.floor(i / 8) % 4];
      const melody = config.melody[i % config.melody.length];
      if (melody !== null) note(melody + (i >= 32 && i % 8 === 0 ? -12 : 0), start, step * 0.85, 0.12);
      if (i % 4 === 0) {
        note(root - 12, start, step * 1.8, 0.15);
        note(root + 12, start, step * 2.5, 0.045, 'triangle');
        note(root + (config.minor ? 15 : 16), start, step * 2.5, 0.035, 'triangle');
      }
      if (track !== 'menu' && i % 2 === 0) note(42, start, 0.06, 0.07);
    }
    return ctx.startRendering();
  }
}
