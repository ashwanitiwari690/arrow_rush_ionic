import { TestBed } from '@angular/core/testing';
import { AdFrequencyService } from './ad-frequency.service';
import { StorageService } from './storage.service';
import { AD_POLICY } from '../config/admob.config';

describe('AdFrequencyService', () => {
  let stored: unknown;
  const storage = { get: vi.fn(async () => stored), set: vi.fn(async (_key: string, value: unknown) => { stored = value; }) };
  let frequency: AdFrequencyService;
  const rounds = (count: number, prefix = 'round') => { for (let i = 0; i < count; i++) frequency.completeRound(`${prefix}-${i}`); };

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-13T12:00:00Z'));
    stored = null;
    storage.get.mockReset();
    storage.get.mockImplementation(async () => stored);
    storage.set.mockReset();
    storage.set.mockImplementation(async (_key: string, value: unknown) => { stored = value; });
    storage.set.mockClear();
    TestBed.configureTestingModule({ providers: [{ provide: StorageService, useValue: storage }] });
    frequency = TestBed.inject(AdFrequencyService);
    await frequency.init();
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.useRealTimers(); });

  it('requires five distinct rounds and an ad-free startup interval', () => {
    rounds(5);
    expect(frequency.canShow('interstitial')).toBe(false);
    vi.advanceTimersByTime(AD_POLICY.interstitialCooldownMs);
    expect(frequency.canShow('interstitial')).toBe(true);
  });

  it('does not count repeated navigation or duplicate completion callbacks as rounds', () => {
    rounds(4); rounds(4);
    vi.advanceTimersByTime(AD_POLICY.interstitialCooldownMs);
    expect(frequency.canShow('interstitial')).toBe(false);
    frequency.completeRound('fifth');
    expect(frequency.canShow('interstitial')).toBe(true);
  });

  it('prevents a follow-up interstitial after a rewarded ad and applies a reward cooldown', () => {
    frequency.shown('rewarded'); frequency.dismissed(); rounds(5);
    expect(frequency.canShow('rewarded')).toBe(false);
    vi.advanceTimersByTime(AD_POLICY.rewardedCooldownMs);
    expect(frequency.canShow('rewarded')).toBe(true);
    expect(frequency.canShow('interstitial')).toBe(false);
    vi.advanceTimersByTime(AD_POLICY.interstitialCooldownMs - AD_POLICY.rewardedCooldownMs);
    expect(frequency.canShow('interstitial')).toBe(true);
  });

  it('enforces an hourly interstitial cap and expires old impressions', () => {
    for (let i = 0; i < AD_POLICY.interstitialsPerHour; i++) {
      vi.advanceTimersByTime(AD_POLICY.interstitialCooldownMs);
      rounds(5, `batch-${i}`);
      expect(frequency.canShow('interstitial')).toBe(true);
      frequency.shown('interstitial'); frequency.dismissed();
    }
    vi.advanceTimersByTime(AD_POLICY.interstitialCooldownMs); rounds(5, 'extra');
    expect(frequency.canShow('interstitial')).toBe(false);
    vi.advanceTimersByTime(60 * 60_000);
    expect(frequency.canShow('interstitial')).toBe(true);
  });

  it('keeps rewarded limits across an application restart', async () => {
    for (let i = 0; i < AD_POLICY.rewardedAdsPerHour; i++) {
      frequency.shown('rewarded'); frequency.dismissed();
      vi.advanceTimersByTime(AD_POLICY.rewardedCooldownMs);
    }
    await vi.advanceTimersByTimeAsync(0);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: StorageService, useValue: storage }] });
    const restarted = TestBed.inject(AdFrequencyService);
    await restarted.init();
    expect(restarted.canShow('rewarded')).toBe(false);
  });

  it('shares the hourly full-screen cap between rewarded and interstitial ads', () => {
    for (let i = 0; i < AD_POLICY.interstitialsPerHour; i++) {
      vi.advanceTimersByTime(AD_POLICY.interstitialCooldownMs); rounds(5, `interstitial-${i}`);
      expect(frequency.canShow('interstitial')).toBe(true);
      frequency.shown('interstitial'); frequency.dismissed();
    }
    for (let i = AD_POLICY.interstitialsPerHour; i < AD_POLICY.fullScreenAdsPerHour; i++) {
      vi.advanceTimersByTime(AD_POLICY.rewardedCooldownMs);
      expect(frequency.canShow('rewarded')).toBe(true);
      frequency.shown('rewarded'); frequency.dismissed();
    }
    vi.advanceTimersByTime(AD_POLICY.rewardedCooldownMs);
    expect(frequency.canShow('rewarded')).toBe(false);
  });

  it('keeps the daily interstitial cap after the hourly window has expired', () => {
    for (let i = 0; i < AD_POLICY.interstitialsPerDay; i++) {
      vi.advanceTimersByTime(60 * 60_000); rounds(5, `day-${i}`);
      expect(frequency.canShow('interstitial')).toBe(true);
      frequency.shown('interstitial'); frequency.dismissed();
    }
    vi.advanceTimersByTime(60 * 60_000); rounds(5, 'day-extra');
    expect(frequency.canShow('interstitial')).toBe(false);
    vi.advanceTimersByTime(24 * 60 * 60_000);
    expect(frequency.canShow('interstitial')).toBe(true);
  });

  it('counts failed-load reservations, throttles repeated requests, and persists their caps', async () => {
    const first = Date.now();
    expect(frequency.reserveRequest('banner')).toBe(true);
    expect(frequency.reserveRequest('banner')).toBe(false);
    expect(frequency.nextRequestAllowedAt('banner')).toBe(first + AD_POLICY.requestCooldownMs);
    vi.advanceTimersByTime(AD_POLICY.requestCooldownMs);
    expect(frequency.reserveRequest('banner')).toBe(true);
    vi.advanceTimersByTime(AD_POLICY.requestCooldownMs);
    expect(frequency.reserveRequest('banner')).toBe(false);
    expect(frequency.nextRequestAllowedAt('banner')).toBe(first + 60 * 60_000);
    await vi.advanceTimersByTimeAsync(0);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: StorageService, useValue: storage }] });
    frequency = TestBed.inject(AdFrequencyService); await frequency.init();
    expect(frequency.reserveRequest('banner')).toBe(false);
    vi.advanceTimersByTime(60 * 60_000);
    expect(frequency.reserveRequest('banner')).toBe(true);
  });

  it('applies one request budget across formats as well as each format budget', () => {
    for (let i = 0; i < AD_POLICY.requestsPerHour; i++) {
      const format = i < 2 ? 'banner' : i < 5 ? 'interstitial' : 'rewarded';
      expect(frequency.reserveRequest(format)).toBe(true);
      vi.advanceTimersByTime(AD_POLICY.requestCooldownMs);
    }
    // Rewarded still has individual capacity, but the combined budget is exhausted.
    expect(frequency.reserveRequest('rewarded')).toBe(false);
  });

  it('limits banner windows even when a cached banner needs no new request', () => {
    for (let i = 0; i < AD_POLICY.bannerWindowsPerDay; i++) {
      expect(frequency.reserveBannerWindow()).toBe(true);
      expect(frequency.reserveBannerWindow()).toBe(false);
      vi.advanceTimersByTime(60 * 60_000);
    }
    expect(frequency.canStartBannerWindow()).toBe(false);
    vi.advanceTimersByTime(24 * 60 * 60_000);
    expect(frequency.canStartBannerWindow()).toBe(true);
  });

  it('enforces the daily combined request budget after hourly budgets have reset', () => {
    for (let i = 0; i < AD_POLICY.requestsPerDay; i++) {
      expect(frequency.reserveRequest(i < 8 ? 'interstitial' : 'rewarded')).toBe(true);
      vi.advanceTimersByTime(60 * 60_000);
    }
    // Banner has no individual requests, but all formats share the daily budget.
    expect(frequency.reserveRequest('banner')).toBe(false);
    vi.advanceTimersByTime(24 * 60 * 60_000);
    expect(frequency.reserveRequest('banner')).toBe(true);
  });

  it('restores previous records that do not yet contain request and banner counters', async () => {
    stored = { lastDismissedAt: Date.now(), rewarded: [Date.now()], interstitial: [] };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: StorageService, useValue: storage }] });
    frequency = TestBed.inject(AdFrequencyService); await frequency.init();
    expect(frequency.canShow('rewarded')).toBe(false);
    expect(frequency.reserveRequest('banner')).toBe(true);
    expect(frequency.reserveBannerWindow()).toBe(true);
  });

  it('defers ads when persisted limits cannot be read', async () => {
    storage.get.mockRejectedValueOnce(new Error('Preferences unavailable'));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: StorageService, useValue: storage }] });
    frequency = TestBed.inject(AdFrequencyService); await frequency.init();
    expect(frequency.canShow('rewarded')).toBe(false);
    expect(frequency.reserveRequest('banner')).toBe(false);
    expect(frequency.reserveBannerWindow()).toBe(false);
  });

  it('stops further serving if updated limits cannot be saved', async () => {
    storage.set.mockRejectedValueOnce(new Error('Preferences unavailable'));
    expect(frequency.reserveRequest('rewarded')).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(frequency.canShow('rewarded')).toBe(false);
    expect(frequency.reserveRequest('interstitial')).toBe(false);
  });
});
