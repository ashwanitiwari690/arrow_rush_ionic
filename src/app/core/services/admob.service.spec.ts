import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Capacitor } from '@capacitor/core';
import { BannerAdPluginEvents, RewardAdPluginEvents, InterstitialAdPluginEvents } from '@capacitor-community/admob';
import { AdMobService } from './admob.service';
import { AdFrequencyService } from './ad-frequency.service';
import { MockAdService } from './mock-ad.service';
import { MusicService } from './music.service';
import { AudioService } from './audio.service';
import { ConnectivityService } from './connectivity.service';
import { AD_POLICY, TEST_AD_UNIT_IDS } from '../config/admob.config';
import { environment } from '../../../environments/environment';

const sdk = vi.hoisted(() => ({
  initialize: vi.fn(), requestConsentInfo: vi.fn(), showConsentForm: vi.fn(), showPrivacyOptionsForm: vi.fn(),
  prepareInterstitial: vi.fn(), prepareRewardVideoAd: vi.fn(), showRewardVideoAd: vi.fn(), showInterstitial: vi.fn(),
  showBanner: vi.fn(), hideBanner: vi.fn(), resumeBanner: vi.fn(), removeBanner: vi.fn(), addListener: vi.fn(),
}));
vi.mock('@capacitor-community/admob', async (importOriginal) => ({
  ...await importOriginal<typeof import('@capacitor-community/admob')>(), AdMob: sdk,
}));

describe('AdMobService safeguards', () => {
  const active = signal(true);
  const online = signal(true);
  const frequency = {
    init: vi.fn(), completeRound: vi.fn(), canShow: vi.fn(), shown: vi.fn(), dismissed: vi.fn(),
    reserveRequest: vi.fn(), nextRequestAllowedAt: vi.fn(), canStartBannerWindow: vi.fn(), reserveBannerWindow: vi.fn(),
  };
  const music = { setAdPaused: vi.fn() };
  const features = { ...environment.features };
  let listeners: Map<string, Set<(value: unknown) => void>>;
  let ads: AdMobService;
  const consent = (canRequestAds = true) => ({ status: 'OBTAINED', canRequestAds, isConsentFormAvailable: false, privacyOptionsRequirementStatus: 'REQUIRED' });
  const flush = async () => { TestBed.tick(); for (let i = 0; i < 30; i++) await Promise.resolve(); };
  const emit = (event: string, value: unknown = {}) => { for (const callback of listeners.get(event) ?? []) callback(value); };
  const dismissReward = async () => { emit(RewardAdPluginEvents.Dismissed); await vi.advanceTimersByTimeAsync(300); await flush(); };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-13T12:00:00Z'));
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    for (const method of Object.values(sdk)) method.mockReset();
    for (const method of Object.values(frequency)) method.mockReset();
    music.setAdPaused.mockClear();
    Object.assign(environment.features, { adsEnabled: true, interstitialAdsEnabled: true, rewardedAdsEnabled: true, bannerAdsEnabled: true });
    active.set(true); online.set(true); listeners = new Map();
    sdk.requestConsentInfo.mockResolvedValue(consent());
    sdk.showConsentForm.mockResolvedValue(consent());
    sdk.initialize.mockResolvedValue(undefined);
    sdk.prepareInterstitial.mockResolvedValue({ adUnitId: 'interstitial' });
    sdk.prepareRewardVideoAd.mockResolvedValue({ adUnitId: 'rewarded' });
    sdk.showRewardVideoAd.mockReturnValue(new Promise(() => undefined));
    sdk.showInterstitial.mockResolvedValue(undefined);
    sdk.showBanner.mockResolvedValue(undefined);
    sdk.hideBanner.mockResolvedValue(undefined);
    sdk.resumeBanner.mockResolvedValue(undefined);
    sdk.removeBanner.mockResolvedValue(undefined);
    sdk.showPrivacyOptionsForm.mockResolvedValue(undefined);
    sdk.addListener.mockImplementation(async (event: string, callback: (value: unknown) => void) => {
      const callbacks = listeners.get(event) ?? new Set();
      callbacks.add(callback); listeners.set(event, callbacks);
      return { remove: async () => { callbacks.delete(callback); } };
    });
    frequency.init.mockResolvedValue(undefined); frequency.canShow.mockReturnValue(true);
    frequency.reserveRequest.mockReturnValue(true);
    frequency.nextRequestAllowedAt.mockImplementation(() => Date.now() + AD_POLICY.retryBaseMs);
    frequency.canStartBannerWindow.mockReturnValue(true); frequency.reserveBannerWindow.mockReturnValue(true);
    TestBed.configureTestingModule({ providers: [
      { provide: AudioService, useValue: { appActive: active } },
      { provide: ConnectivityService, useValue: { online } },
      { provide: MusicService, useValue: music },
      { provide: AdFrequencyService, useValue: frequency },
      { provide: MockAdService, useValue: { showRewardedAd: vi.fn(), maybeShowInterstitialAtBreakpoint: vi.fn() } },
    ] });
    ads = TestBed.inject(AdMobService);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    Object.assign(environment.features, features);
    vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks();
  });

  it('requests no ads when consent cannot be established', async () => {
    sdk.requestConsentInfo.mockRejectedValue(new Error('UMP offline'));
    await ads.initialize(); ads.setScreen('/home'); await flush();
    expect((await ads.showRewardedAd()).granted).toBe(false);
    expect(sdk.initialize).not.toHaveBeenCalled();
    expect(sdk.prepareInterstitial).not.toHaveBeenCalled();
    expect(sdk.prepareRewardVideoAd).not.toHaveBeenCalled();
    expect(sdk.showBanner).not.toHaveBeenCalled();
  });

  it('waits for required consent before initializing or loading test ads', async () => {
    sdk.requestConsentInfo.mockResolvedValue({ ...consent(false), status: 'REQUIRED', isConsentFormAvailable: true });
    await ads.initialize(); await flush();
    expect(sdk.showConsentForm).toHaveBeenCalledOnce();
    expect(sdk.showConsentForm.mock.invocationCallOrder[0]).toBeLessThan(sdk.initialize.mock.invocationCallOrder[0]);
    expect(sdk.prepareRewardVideoAd).toHaveBeenCalledWith({ adId: TEST_AD_UNIT_IDS.rewarded, isTesting: true });
    expect(ads.privacyOptionsRequired()).toBe(true);
  });

  it('does not fail open when UMP still requires consent without an available form', async () => {
    sdk.requestConsentInfo.mockResolvedValue({ ...consent(false), status: 'REQUIRED' });
    await ads.initialize(); await flush();
    expect(sdk.initialize).not.toHaveBeenCalled();
    expect(sdk.prepareRewardVideoAd).not.toHaveBeenCalled();
  });

  it('keeps the full-screen lock until dismissal, even after an earned reward', async () => {
    await ads.initialize(); await flush();
    let finished = false;
    const result = ads.showRewardedAd().then((reward) => { finished = true; return reward; });
    await flush(); emit(RewardAdPluginEvents.Showed); emit(RewardAdPluginEvents.Rewarded, { amount: 1, type: 'hint' });
    await flush();
    expect(finished).toBe(false);
    expect(ads.fullScreenShowing()).toBe(true);
    expect((await ads.showRewardedAd()).granted).toBe(false);
    await dismissReward();
    expect((await result).granted).toBe(true);
    expect(ads.fullScreenShowing()).toBe(false);
    expect(frequency.shown).toHaveBeenCalledExactlyOnceWith('rewarded');
    expect(music.setAdPaused).toHaveBeenLastCalledWith(false);
  });

  it('does not award a reward for closing an unfinished ad or an empty promise result', async () => {
    sdk.showRewardVideoAd.mockResolvedValue(undefined);
    await ads.initialize(); await flush();
    const result = ads.showRewardedAd(); await flush();
    emit(RewardAdPluginEvents.Showed); await dismissReward();
    expect((await result).granted).toBe(false);
  });

  it('accepts a confirmed reward promise but still waits for the ad to close', async () => {
    sdk.showRewardVideoAd.mockResolvedValue({ amount: 1, type: 'hint' });
    await ads.initialize(); await flush();
    const result = ads.showRewardedAd(); await flush();
    expect(ads.fullScreenShowing()).toBe(true);
    await dismissReward();
    expect((await result).granted).toBe(true);
  });

  it('cancels a rewarded ad if navigation changes while it is loading', async () => {
    let loaded!: (value: unknown) => void;
    sdk.prepareRewardVideoAd.mockReturnValue(new Promise((resolve) => { loaded = resolve; }));
    await ads.initialize(); await flush();
    const result = ads.showRewardedAd(); await flush();
    ads.setScreen('/game-play/2'); loaded({ adUnitId: 'rewarded' }); await flush();
    expect((await result).granted).toBe(false);
    expect(sdk.showRewardVideoAd).not.toHaveBeenCalled();
  });

  it('hides banners during gameplay and wallet use, and reuses them on menu screens', async () => {
    await ads.initialize(); await flush();
    ads.setScreen('/home'); await ads.showBanner(); await flush();
    expect(sdk.showBanner).toHaveBeenCalledOnce();
    expect(ads.bannerHeight()).toBeGreaterThanOrEqual(90);
    ads.setScreen('/game-play/1'); await ads.showBanner(); await flush();
    expect(ads.bannerHeight()).toBe(0);
    expect(sdk.hideBanner).toHaveBeenCalled();
    ads.setScreen('/profile'); await ads.showBanner(); await flush();
    expect(ads.bannerHeight()).toBe(0);
    ads.setScreen('/store'); await ads.showBanner(); await flush();
    expect(sdk.resumeBanner).toHaveBeenCalledOnce();
    expect(sdk.showBanner).toHaveBeenCalledOnce();
    emit(BannerAdPluginEvents.SizeChanged, { height: 120 });
    expect(ads.bannerHeight()).toBe(120);
  });

  it('hides native banners while an Ionic dialog is open', async () => {
    await ads.initialize(); await flush();
    ads.setScreen('/store'); await ads.showBanner(); await flush();
    const modal = document.createElement('ion-modal');
    document.body.append(modal);
    try {
      modal.dispatchEvent(new CustomEvent('ionModalWillPresent', { bubbles: true }));
      await flush();
      expect(ads.bannerHeight()).toBe(0);
      expect(sdk.hideBanner).toHaveBeenCalled();
      modal.dispatchEvent(new CustomEvent('ionModalDidDismiss', { bubbles: true }));
      await ads.showBanner(); await flush();
      expect(ads.bannerHeight()).toBeGreaterThan(0);
      expect(sdk.resumeBanner).toHaveBeenCalled();
    } finally { modal.remove(); }
  });

  it('hides a banner after its short window and requires a new menu visit to resume', async () => {
    await ads.initialize(); await flush();
    ads.setScreen('/home'); await ads.showBanner(); await flush();
    expect(ads.bannerHeight()).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(AD_POLICY.bannerWindowMs); await flush();
    expect(ads.bannerHeight()).toBe(0);
    await ads.showBanner(); await flush();
    expect(ads.bannerHeight()).toBe(0);
    expect(sdk.resumeBanner).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(AD_POLICY.bannerWindowCooldownMs);
    ads.setScreen('/store'); await ads.showBanner(); await flush();
    expect(ads.bannerHeight()).toBeGreaterThan(0);
    expect(sdk.showBanner).toHaveBeenCalledOnce();
    expect(sdk.resumeBanner).toHaveBeenCalledOnce();
    expect(frequency.reserveBannerWindow).toHaveBeenCalledTimes(2);
  });

  it('does not load ads when the app-initiated request budget is exhausted', async () => {
    frequency.reserveRequest.mockReturnValue(false);
    await ads.initialize(); ads.setScreen('/home'); await ads.showBanner(); await flush();
    expect(sdk.prepareInterstitial).not.toHaveBeenCalled();
    expect(sdk.prepareRewardVideoAd).not.toHaveBeenCalled();
    expect(sdk.showBanner).not.toHaveBeenCalled();
    expect(ads.bannerHeight()).toBe(0);
    const attempts = frequency.reserveRequest.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000); await flush();
    expect(frequency.reserveRequest).toHaveBeenCalledTimes(attempts);
  });

  it('does not resume a cached banner when its exposure budget is exhausted', async () => {
    await ads.initialize(); ads.setScreen('/home'); await ads.showBanner(); await flush();
    await vi.advanceTimersByTimeAsync(AD_POLICY.bannerWindowMs); await flush();
    frequency.canStartBannerWindow.mockReturnValue(false);
    ads.setScreen('/store'); await ads.showBanner(); await flush();
    expect(ads.bannerHeight()).toBe(0);
    expect(sdk.resumeBanner).not.toHaveBeenCalled();
  });

  it('skips interstitials that are not preloaded and never shows a late load', async () => {
    let loaded!: (value: unknown) => void;
    sdk.prepareInterstitial.mockReturnValue(new Promise((resolve) => { loaded = resolve; }));
    await ads.initialize(); await flush();
    await ads.maybeShowInterstitialAtBreakpoint({ roundId: 'first', canShow: () => true });
    loaded({ adUnitId: 'interstitial' }); await flush();
    expect(sdk.showInterstitial).not.toHaveBeenCalled();
  });

  it('cancels an eligible interstitial when the user leaves during the tap-settling delay', async () => {
    await ads.initialize(); await flush();
    const result = ads.maybeShowInterstitialAtBreakpoint({ roundId: 'first', canShow: () => true });
    ads.setScreen('/home');
    await vi.advanceTimersByTimeAsync(AD_POLICY.roundBreakDelayMs); await result;
    expect(sdk.showInterstitial).not.toHaveBeenCalled();
  });

  it('counts real interstitial displays and releases their callbacks on dismissal', async () => {
    await ads.initialize(); await flush();
    const result = ads.maybeShowInterstitialAtBreakpoint({ roundId: 'first', canShow: () => true });
    await vi.advanceTimersByTimeAsync(AD_POLICY.roundBreakDelayMs); await flush();
    emit(InterstitialAdPluginEvents.Showed); emit(InterstitialAdPluginEvents.Dismissed);
    await vi.advanceTimersByTimeAsync(1); await result;
    expect(frequency.shown).toHaveBeenCalledExactlyOnceWith('interstitial');
    expect(listeners.get(InterstitialAdPluginEvents.Dismissed)?.size).toBe(0);
  });

  it('backs off after no-fill instead of re-requesting on every navigation', async () => {
    sdk.prepareRewardVideoAd.mockRejectedValue(new Error('no fill'));
    await ads.initialize(); await flush();
    ads.setScreen('/home'); ads.setScreen('/store'); await flush();
    expect(sdk.prepareRewardVideoAd).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(AD_POLICY.retryBaseMs); await flush();
    expect(sdk.prepareRewardVideoAd).toHaveBeenCalledTimes(2);
  });

  it('does not serve or retry ads while the app is in the background', async () => {
    active.set(false); await flush(); await ads.initialize(); ads.setScreen('/home'); await flush();
    expect((await ads.showRewardedAd()).granted).toBe(false);
    expect(sdk.requestConsentInfo).not.toHaveBeenCalled();
    expect(sdk.prepareRewardVideoAd).not.toHaveBeenCalled();
    expect(ads.bannerHeight()).toBe(0);
  });

  it('invalidates cached ads after privacy choices change', async () => {
    await ads.initialize(); await flush();
    sdk.requestConsentInfo.mockResolvedValue(consent(false));
    expect(await ads.showPrivacyOptions()).toBe(true);
    await flush();
    const requests = sdk.prepareRewardVideoAd.mock.calls.length;
    expect((await ads.showRewardedAd()).granted).toBe(false);
    expect(sdk.prepareRewardVideoAd.mock.calls.length).toBe(requests);
  });
});
