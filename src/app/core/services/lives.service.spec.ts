import { TestBed } from '@angular/core/testing';
import { LivesService } from './lives.service';
import { StorageService } from './storage.service';
import { ConfigService } from './config.service';

describe('LivesService regeneration without ads', () => {
  let lives: LivesService;
  const storage = { get: vi.fn(), set: vi.fn().mockResolvedValue(undefined) };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-13T12:00:00Z'));
    storage.get.mockResolvedValue({ count: 0, lastRegenAt: Date.now() });
    TestBed.configureTestingModule({ providers: [
      { provide: StorageService, useValue: storage },
      { provide: ConfigService, useValue: { getGameConfig: async () => ({ livesPerLevel: 3, livesRegenMinutes: 10 }) } },
    ] });
    lives = TestBed.inject(LivesService);
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.useRealTimers(); });

  it('restores lives while the app stays open, with no ad needed', async () => {
    await lives.init();
    expect(lives.hasLives()).toBe(false);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(lives.count()).toBe(1);
    expect(lives.hasLives()).toBe(true);
    await vi.advanceTimersByTimeAsync(20 * 60_000);
    expect(lives.count()).toBe(3);
    expect(lives.nextRegenAt()).toBeNull();
  });

  it('catches up after the app has been suspended', async () => {
    await lives.init();
    vi.setSystemTime(new Date(Date.now() + 30 * 60_000));
    await lives.init();
    expect(lives.count()).toBe(3);
  });

  it('does not postpone the next free life when an optional rewarded life is granted', async () => {
    await lives.init();
    const next = lives.nextRegenAt();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    await lives.grantLife();
    expect(lives.count()).toBe(1);
    expect(lives.nextRegenAt()).toBe(next);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(lives.count()).toBe(2);
  });
});
