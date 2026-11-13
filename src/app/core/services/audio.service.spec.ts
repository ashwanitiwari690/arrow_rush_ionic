import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AudioService } from './audio.service';
import { SettingsService } from './settings.service';

const parameter = (initial = 0) => {
  const param = { value: initial, setTargetAtTime: vi.fn((value: number) => { param.value = value; }) };
  return param;
};
const connect = () => vi.fn((destination: unknown) => destination);

describe('AudioService output levels', () => {
  const settings = signal({ soundEnabled: true, musicEnabled: true, soundVolume: 1, musicVolume: 1 });
  let safetyCurve: { curve: Float32Array | null };
  let audio: AudioService;

  beforeEach(() => {
    settings.set({ soundEnabled: true, musicEnabled: true, soundVolume: 1, musicVolume: 1 });
    safetyCurve = { curve: null };
    vi.stubGlobal('AudioContext', class {
      currentTime = 0;
      state = 'running';
      destination = {};
      createGain() { return { gain: parameter(1), connect: connect() }; }
      createDynamicsCompressor() {
        return { threshold: parameter(), knee: parameter(), ratio: parameter(), attack: parameter(), release: parameter(), connect: connect() };
      }
      createWaveShaper() { return Object.assign(safetyCurve, { connect: connect() }); }
      close() { return Promise.resolve(); }
      suspend() { return Promise.resolve(); }
      resume() { return Promise.resolve(); }
    });
    TestBed.configureTestingModule({ providers: [{ provide: SettingsService, useValue: { settings } }] });
    audio = TestBed.inject(AudioService);
  });

  afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

  it('boosts both channels at full volume and keeps slider changes proportional', () => {
    const sound = audio.output('sound')!;
    const music = audio.output('music')!;
    const fullSound = sound.gain.value;
    const fullMusic = music.gain.value;
    expect(fullSound).toBeGreaterThan(1);
    expect(fullMusic).toBeGreaterThan(1);
    settings.update((value) => ({ ...value, soundVolume: 0.5, musicVolume: 0.25 }));
    TestBed.tick();
    expect(sound.gain.value).toBe(fullSound * 0.5);
    expect(music.gain.value).toBe(fullMusic * 0.25);
  });

  it('mutes and restores effects independently of background music', () => {
    const sound = audio.output('sound')!;
    const music = audio.output('music')!;
    const fullSound = sound.gain.value;
    const fullMusic = music.gain.value;
    settings.update((value) => ({ ...value, soundEnabled: false }));
    TestBed.tick();
    expect(sound.gain.value).toBe(0);
    expect(music.gain.value).toBe(fullMusic);
    settings.update((value) => ({ ...value, soundEnabled: true, musicEnabled: false }));
    TestBed.tick();
    expect(sound.gain.value).toBe(fullSound);
    expect(music.gain.value).toBe(0);
  });

  it('keeps saved mute and zero-volume settings silent on startup', () => {
    settings.update((value) => ({ ...value, soundEnabled: false, musicVolume: 0 }));
    expect(audio.output('sound')!.gain.value).toBe(0);
    expect(audio.output('music')!.gain.value).toBe(0);
  });

  it('preserves normal samples while limiting loud peaks below full scale', () => {
    audio.getContext();
    const curve = safetyCurve.curve!;
    expect(curve.length).toBeGreaterThan(0);
    expect([...curve].every((value) => Number.isFinite(value) && Math.abs(value) < 1)).toBe(true);
    expect(curve[(curve.length - 1) / 2]).toBe(0);
    expect(curve[(curve.length - 1) * 3 / 4]).toBeCloseTo(0.5, 4);
    expect(curve.at(-1)).toBeGreaterThan(0.9);
    expect(curve[0]).toBeCloseTo(-curve.at(-1)!, 4);
  });
});
