import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MusicService } from './music.service';
import { AudioService } from './audio.service';
import { SettingsService } from './settings.service';

const makeSource = () => ({ buffer: null, loop: false, connect: vi.fn(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn() });
const makeGain = () => ({ gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() });

describe('MusicService', () => {
  const settings = signal({ musicEnabled: true, musicVolume: 0.35 });
  const active = signal(true);
  let sources: ReturnType<typeof makeSource>[];
  let rendered: Promise<AudioBuffer>;
  let renderCount: number;
  let music: MusicService;

  const flush = async () => { TestBed.tick(); await Promise.resolve(); await Promise.resolve(); };

  beforeEach(() => {
    sources = [];
    renderCount = 0;
    rendered = Promise.resolve({} as AudioBuffer);
    settings.set({ musicEnabled: true, musicVolume: 0.35 });
    active.set(true);
    vi.stubGlobal('OfflineAudioContext', class {
      destination = {};
      createBiquadFilter() { return { type: '', frequency: { value: 0 }, connect: vi.fn() }; }
      createGain() {
        const gain = makeGain();
        gain.connect.mockReturnValue({});
        return gain;
      }
      createOscillator() {
        return { type: '', frequency: { value: 0 }, connect: () => ({ connect: vi.fn() }), start: vi.fn(), stop: vi.fn() };
      }
      startRendering() { renderCount++; return rendered; }
    });
    TestBed.configureTestingModule({ providers: [
      { provide: SettingsService, useValue: { settings } },
      { provide: AudioService, useValue: {
        appActive: active, unlock: vi.fn(), output: () => ({}),
        getContext: () => ({ createBufferSource: () => { const source = makeSource(); sources.push(source); return source; } }),
      } },
    ] });
    music = TestBed.inject(MusicService);
  });

  afterEach(() => { music.stop(); vi.unstubAllGlobals(); });

  it('waits for a user gesture and reuses the rendered loop on resume', async () => {
    music.start('gameplay');
    await flush();
    expect(sources).toHaveLength(0);
    music.unlock();
    await flush();
    expect(sources).toHaveLength(1);
    expect(sources[0].loop).toBe(true);
    music.pause();
    expect(sources[0].stop).toHaveBeenCalledOnce();
    expect(sources[0].disconnect).toHaveBeenCalledOnce();
    music.resume();
    await flush();
    expect(sources).toHaveLength(2);
    expect(renderCount).toBe(1);
  });

  it('stays paused when settings change or music is toggled back on', async () => {
    music.start('gameplay'); music.unlock(); await flush(); music.pause();
    settings.set({ musicEnabled: false, musicVolume: 0.5 }); await flush();
    settings.set({ musicEnabled: true, musicVolume: 0.5 }); await flush();
    expect(sources).toHaveLength(1);
  });

  it('does not start a render that finishes after the player mutes music', async () => {
    let finish!: (value: AudioBuffer) => void;
    rendered = new Promise((resolve) => { finish = resolve; });
    music.start('menu'); music.unlock(); await flush();
    settings.set({ musicEnabled: false, musicVolume: 0.35 }); await flush();
    finish({} as AudioBuffer); await flush();
    expect(sources).toHaveLength(0);
  });

  it('plays only the latest track after a rapid navigation', async () => {
    let finish!: (value: AudioBuffer) => void;
    rendered = new Promise((resolve) => { finish = resolve; });
    music.start('menu'); music.unlock();
    music.start('daily');
    finish({} as AudioBuffer); await flush();
    expect(sources).toHaveLength(1);
    expect(renderCount).toBe(2);
  });

  it('stops background playback and respects explicit pause on return', async () => {
    music.start('gameplay'); music.unlock(); await flush();
    active.set(false); await flush();
    expect(sources[0].stop).toHaveBeenCalledOnce();
    music.pause();
    active.set(true); await flush();
    expect(sources).toHaveLength(1);
  });

  it('does not resume a paused game when an ad closes', async () => {
    music.start('gameplay'); music.unlock(); await flush();
    music.pause(); music.setAdPaused(true);
    music.setAdPaused(false); await flush();
    expect(sources).toHaveLength(1);
    music.resume(); await flush();
    expect(sources).toHaveLength(2);
  });
});
