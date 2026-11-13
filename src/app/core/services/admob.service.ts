import { DestroyRef, Injectable, effect, inject, untracked } from '@angular/core';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import {
  AdMob, AdmobConsentInfo, AdmobConsentStatus, BannerAdPluginEvents,
  BannerAdPosition, BannerAdSize, InterstitialAdPluginEvents,
  MaxAdContentRating, RewardAdPluginEvents,
} from '@capacitor-community/admob';
import { AdService, InterstitialBreakpoint, RewardedAdResult } from './ad.service';
import { AdFrequencyService, FullScreenAdFormat } from './ad-frequency.service';
import { MockAdService } from './mock-ad.service';
import { MusicService } from './music.service';
import { AudioService } from './audio.service';
import { ConnectivityService } from './connectivity.service';
import { AD_UNIT_IDS, AD_LOAD_TIMEOUT_MS, AD_POLICY, BANNER_SCREENS } from '../config/admob.config';
import { environment } from '../../../environments/environment';

interface AdSlot {
  loadedAt: number | null;
  loading?: Promise<void>;
  failures: number;
  nextAttemptAt: number;
}
const newSlot = (): AdSlot => ({ loadedAt: null, failures: 0, nextAttemptAt: 0 });

/** Consent-gated native serving. Web previews never make live AdMob requests. */
@Injectable({ providedIn: 'root' })
export class AdMobService extends AdService {
  private readonly mock = inject(MockAdService);
  private readonly music = inject(MusicService);
  private readonly audio = inject(AudioService);
  private readonly connectivity = inject(ConnectivityService);
  private readonly frequency = inject(AdFrequencyService);
  private readonly isNative = Capacitor.isNativePlatform();
  private readonly slots = { interstitial: newSlot(), rewarded: newSlot() };
  private initPromise?: Promise<void>;
  private initialized = false;
  private sdkInitialized = false;
  private consentAllowed = false;
  private nextInitAttemptAt = 0;
  private fullScreenInFlight = false;
  private screen = '';
  private screenEpoch = 0;
  private adGeneration = 0;
  private destroyed = false;
  private bannerExists = false;
  private bannerVisible = false;
  private bannerFailures = 0;
  private bannerWindowEndsAt = 0;
  private bannerNeedsNewVisit = false;
  private bannerWindowTimer?: ReturnType<typeof setTimeout>;
  private bannerNextAttemptAt = 0;
  private bannerQueue = Promise.resolve();
  private bannerListeners?: Promise<void>;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private retryAt = Infinity;
  private readonly bannerHandles: PluginListenerHandle[] = [];
  private readonly overlays = new Set<EventTarget>();

  constructor() {
    super();
    const overlayCleanup: (() => void)[] = [];
    if (typeof document !== 'undefined') {
      const opening = (event: Event) => {
        if (event.target) this.overlays.add(event.target);
        void this.hideBanner();
      };
      const closed = (event: Event) => {
        if (event.target) this.overlays.delete(event.target);
        this.queueBanner();
      };
      for (const name of ['ionAlert', 'ionModal', 'ionPopover', 'ionActionSheet']) {
        document.addEventListener(`${name}WillPresent`, opening, true);
        document.addEventListener(`${name}DidDismiss`, closed, true);
        overlayCleanup.push(() => {
          document.removeEventListener(`${name}WillPresent`, opening, true);
          document.removeEventListener(`${name}DidDismiss`, closed, true);
        });
      }
    }
    effect(() => {
      const active = this.audio.appActive();
      const online = this.connectivity.online();
      untracked(() => {
        if (!active || !online) {
          void this.hideBanner();
          if (this.retryTimer) clearTimeout(this.retryTimer);
          this.retryTimer = undefined;
          this.retryAt = Infinity;
        }
        this.queueBanner();
        if (active && online) void this.initialize().then(() => this.preloadFormats());
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      for (const remove of overlayCleanup) remove();
      this.adGeneration++;
      if (this.retryTimer) clearTimeout(this.retryTimer);
      if (this.bannerWindowTimer) clearTimeout(this.bannerWindowTimer);
      for (const handle of this.bannerHandles) void handle.remove();
      if (this.isNative && this.bannerExists) void AdMob.removeBanner().catch(() => undefined);
    });
  }

  initialize(): Promise<void> {
    if (!environment.features.adsEnabled || !this.isNative) return Promise.resolve();
    if (this.initialized) return Promise.resolve();
    if (this.initPromise) return this.initPromise;
    if (!this.foreground() || Date.now() < this.nextInitAttemptAt) return Promise.resolve();
    this.nextInitAttemptAt = Date.now() + AD_POLICY.retryBaseMs;
    this.initPromise = this.initializeNative().finally(() => { this.initPromise = undefined; });
    return this.initPromise;
  }

  private async initializeNative(): Promise<void> {
    try {
      let info = await AdMob.requestConsentInfo();
      if (info.status === AdmobConsentStatus.REQUIRED && info.isConsentFormAvailable) {
        info = await AdMob.showConsentForm();
      }
      this.applyConsent(info);
      if (!this.consentAllowed || this.destroyed) return;
      if (!this.sdkInitialized) {
        await AdMob.initialize({
          initializeForTesting: !environment.production || environment.ads.testingDevices.length > 0,
          testingDevices: environment.ads.testingDevices,
          tagForChildDirectedTreatment: false, // Publisher-confirmed 13+ audience.
          maxAdContentRating: MaxAdContentRating.General,
        });
        this.sdkInitialized = true;
      }
      await this.frequency.init();
      this.initialized = true;
      this.preloadFormats();
      this.queueBanner();
    } catch (error) {
      // No ad request is permitted when UMP eligibility cannot be established.
      this.consentAllowed = false;
      this.log('Consent/SDK initialization unavailable; ads deferred.', error);
      this.scheduleRetry(this.nextInitAttemptAt);
    }
  }

  setScreen(path: string): void {
    this.screen = path.split(/[?#]/)[0];
    if (BANNER_SCREENS.has(this.screen)) {
      this.bannerNeedsNewVisit = false;
      if (Date.now() >= this.bannerWindowEndsAt) {
        this.bannerWindowEndsAt = 0;
        if (this.bannerWindowTimer) clearTimeout(this.bannerWindowTimer);
      }
    }
    this.screenEpoch++;
    if (!this.bannerAllowed()) void this.hideBanner();
    this.queueBanner();
    void this.initialize().then(() => { this.preloadFormats(); this.queueBanner(); });
  }

  async showPrivacyOptions(): Promise<boolean> {
    if (!this.isNative || !environment.features.adsEnabled || this.fullScreenInFlight || !this.foreground()) return false;
    this.fullScreenInFlight = true;
    this._fullScreenShowing.set(true);
    this.music.setAdPaused(true);
    this.invalidateAds();
    this.consentAllowed = false;
    try {
      await this.hideBanner();
      await AdMob.showPrivacyOptionsForm();
      this.applyConsent(await AdMob.requestConsentInfo());
      if (!this.consentAllowed) this.initialized = false;
      return true;
    } catch (error) {
      this.consentAllowed = false;
      this.initialized = false;
      this.log('Privacy options unavailable.', error);
      return false;
    } finally {
      this._fullScreenShowing.set(false);
      this.fullScreenInFlight = false;
      this.music.setAdPaused(false);
      void this.initialize().then(() => { this.preloadFormats(); this.queueBanner(); });
    }
  }

  async showRewardedAd(canShow: () => boolean = () => true): Promise<RewardedAdResult> {
    if (!this.enabled('rewarded')) return { granted: false, reason: 'Ads are disabled in this build.' };
    if (!this.isNative) return this.mock.showRewardedAd(canShow);
    if (this.fullScreenInFlight) return { granted: false, reason: 'Another ad or privacy form is already open.' };
    const epoch = this.screenEpoch;
    const presentable = () => epoch === this.screenEpoch && canShow() && this.foreground() && !this.overlayOpen();
    this.fullScreenInFlight = true;
    try {
      await this.initialize();
      if (!this.canRequest() || !presentable()) return { granted: false, reason: 'An ad is not available right now.' };
      if (!this.frequency.canShow('rewarded')) return { granted: false, reason: 'Please wait a little before watching another ad.' };
      await this.preload('rewarded');
      if (!this.ready('rewarded') || !presentable()) return { granted: false, reason: 'No ad is ready. Please try again shortly.' };
      const granted = await this.showPrepared('rewarded', presentable);
      return granted ? { granted: true } : { granted: false, reason: 'Ad not completed. No reward was added.' };
    } catch (error) {
      this.log('Rewarded ad unavailable.', error);
      return { granted: false, reason: 'An ad could not be shown. Please try again later.' };
    } finally {
      this.fullScreenInFlight = false;
      this.preloadFormats();
      this.queueBanner();
    }
  }

  async maybeShowInterstitialAtBreakpoint(breakpoint: InterstitialBreakpoint): Promise<void> {
    if (!this.enabled('interstitial') || !breakpoint.roundId) return;
    if (!this.isNative) return this.mock.maybeShowInterstitialAtBreakpoint(breakpoint);
    this.frequency.completeRound(breakpoint.roundId);
    if (this.fullScreenInFlight || !this.canRequest() || !breakpoint.canShow()) return;
    const epoch = this.screenEpoch;
    const presentable = () => epoch === this.screenEpoch && this.foreground() && !this.overlayOpen() && breakpoint.canShow();
    if (!this.frequency.canShow('interstitial')) return;
    // Never wait for an interstitial to load after the player has reached a break.
    if (!this.ready('interstitial')) { void this.preload('interstitial'); return; }
    this.fullScreenInFlight = true;
    try {
      await new Promise((resolve) => setTimeout(resolve, AD_POLICY.roundBreakDelayMs));
      if (!presentable() || !this.canRequest() || !this.frequency.canShow('interstitial')) return;
      await this.showPrepared('interstitial', presentable);
    } catch (error) {
      this.log('Interstitial skipped.', error);
    } finally {
      this.fullScreenInFlight = false;
      this.preloadFormats();
      this.queueBanner();
    }
  }

  async showBanner(): Promise<void> { this.queueBanner(); await this.bannerQueue; }

  async hideBanner(): Promise<void> {
    this._bannerHeight.set(0);
    if (!this.isNative || !this.bannerExists) return;
    await AdMob.hideBanner().catch(() => undefined);
    this.bannerVisible = false;
  }

  private applyConsent(info: AdmobConsentInfo): void {
    this.consentAllowed = info.canRequestAds === true;
    this._privacyOptionsRequired.set(info.privacyOptionsRequirementStatus === 'REQUIRED');
  }

  private foreground(): boolean {
    return !this.destroyed && this.audio.appActive() && this.connectivity.online();
  }

  private enabled(format: FullScreenAdFormat): boolean {
    return environment.features.adsEnabled && (format === 'rewarded' ? environment.features.rewardedAdsEnabled : environment.features.interstitialAdsEnabled);
  }

  private canRequest(): boolean {
    return this.sdkInitialized && this.consentAllowed && this.foreground() && environment.features.adsEnabled;
  }

  private ready(format: FullScreenAdFormat): boolean {
    const loaded = this.slots[format].loadedAt;
    return loaded !== null && Date.now() - loaded < AD_POLICY.cachedAdLifetimeMs;
  }

  private preloadFormats(): void {
    if (!this.isNative || !this.canRequest() || this.fullScreenInFlight) return;
    void this.preload('interstitial');
    void this.preload('rewarded');
  }

  private preload(format: FullScreenAdFormat): Promise<void> {
    const slot = this.slots[format];
    if (!this.enabled(format) || !this.canRequest()) return Promise.resolve();
    if (this.ready(format)) {
      this.scheduleRetry(slot.loadedAt! + AD_POLICY.cachedAdLifetimeMs);
      return Promise.resolve();
    }
    if (slot.loading) return slot.loading;
    if (Date.now() < slot.nextAttemptAt) {
      this.scheduleRetry(slot.nextAttemptAt);
      return Promise.resolve();
    }
    if (!this.frequency.reserveRequest(format)) {
      this.scheduleRetry(this.frequency.nextRequestAllowedAt(format));
      return Promise.resolve();
    }
    const generation = this.adGeneration;
    const request = Promise.resolve().then(() => format === 'interstitial'
      ? AdMob.prepareInterstitial({ adId: AD_UNIT_IDS.interstitial, isTesting: !environment.production })
      : AdMob.prepareRewardVideoAd({ adId: AD_UNIT_IDS.rewarded, isTesting: !environment.production }));
    const task = this.withTimeout(request).then(() => {
      if (generation !== this.adGeneration || !this.consentAllowed) return;
      slot.loadedAt = Date.now();
      slot.failures = 0;
      slot.nextAttemptAt = 0;
      this.scheduleRetry(slot.loadedAt + AD_POLICY.cachedAdLifetimeMs);
    }).catch((error: unknown) => {
      slot.loadedAt = null;
      slot.failures++;
      slot.nextAttemptAt = Date.now() + this.backoff(slot.failures);
      this.scheduleRetry(slot.nextAttemptAt);
      this.log(`${format} load deferred.`, error);
    }).finally(() => {
      if (slot.loading === task) slot.loading = undefined;
      if (generation !== this.adGeneration) this.preloadFormats();
    });
    slot.loading = task;
    return task;
  }

  private async showPrepared(format: FullScreenAdFormat, canShow: () => boolean): Promise<boolean> {
    let earned = false;
    let shown = false;
    let settled = false;
    let dismissed = false;
    let dismissalTimer: ReturnType<typeof setTimeout> | undefined;
    let resolveCompletion!: (value: boolean) => void;
    const completion = new Promise<boolean>((resolve) => { resolveCompletion = resolve; });
    const handles: PluginListenerHandle[] = [];
    const finish = (granted: boolean) => { if (!settled) { settled = true; resolveCompletion(granted); } };
    const onShown = () => {
      if (shown) return;
      shown = true;
      this.frequency.shown(format);
    };
    const onDismissed = () => {
      if (settled || dismissed) return;
      dismissed = true;
      if (!shown) onShown();
      this.frequency.dismissed();
      // Some mediated networks deliver their reward callback immediately after dismissal.
      dismissalTimer = setTimeout(() => finish(earned), format === 'rewarded' ? 300 : 0);
    };
    const onFailed = () => { if (shown) this.frequency.dismissed(); finish(earned); };
    const onReward = (reward: { amount: number }) => {
      if (Number.isFinite(reward?.amount) && reward.amount > 0) earned = true;
    };
    try {
      const registrations = format === 'rewarded' ? [
        AdMob.addListener(RewardAdPluginEvents.Showed, onShown),
        AdMob.addListener(RewardAdPluginEvents.Rewarded, onReward),
        AdMob.addListener(RewardAdPluginEvents.Dismissed, onDismissed),
        AdMob.addListener(RewardAdPluginEvents.FailedToShow, onFailed),
      ] : [
        AdMob.addListener(InterstitialAdPluginEvents.Showed, onShown),
        AdMob.addListener(InterstitialAdPluginEvents.Dismissed, onDismissed),
        AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, onFailed),
      ];
      // Install every callback before invoking the native show method.
      const registered = await Promise.allSettled(registrations);
      for (const result of registered) if (result.status === 'fulfilled') handles.push(result.value);
      const failed = registered.find((result) => result.status === 'rejected');
      if (failed?.status === 'rejected') throw failed.reason;
      if (!canShow() || !this.canRequest()) return false;
      this.slots[format].loadedAt = null;
      this._fullScreenShowing.set(true);
      this.music.setAdPaused(true);
      await this.hideBanner();
      if (!canShow() || !this.canRequest()) return false;
      if (format === 'rewarded') {
        void AdMob.showRewardVideoAd().then(onReward).catch(() => { if (!shown) onFailed(); });
      } else {
        void AdMob.showInterstitial().catch(onFailed);
      }
      // A reward callback alone must not unlock navigation while the ad is still visible.
      return await completion;
    } finally {
      if (dismissalTimer) clearTimeout(dismissalTimer);
      await Promise.all(handles.map((handle) => handle.remove().catch(() => undefined)));
      this._fullScreenShowing.set(false);
      this.music.setAdPaused(false);
    }
  }

  private bannerAllowed(): boolean {
    return environment.features.adsEnabled && environment.features.bannerAdsEnabled && BANNER_SCREENS.has(this.screen)
      && this.foreground() && !this.fullScreenInFlight && !this.overlayOpen()
      && !this.bannerNeedsNewVisit && (this.bannerWindowEndsAt === 0 || Date.now() < this.bannerWindowEndsAt)
      && (!this.isNative || this.canRequest());
  }

  private overlayOpen(): boolean {
    for (const overlay of this.overlays) if (overlay instanceof Node && !overlay.isConnected) this.overlays.delete(overlay);
    return this.overlays.size > 0;
  }

  private queueBanner(): void {
    this.bannerQueue = this.bannerQueue.then(() => this.updateBanner()).catch((error: unknown) => this.log('Banner update deferred.', error));
  }

  private async updateBanner(): Promise<void> {
    if (!this.bannerAllowed()) { await this.hideBanner(); return; }
    if (!this.isNative) { this._bannerHeight.set(50); return; }
    if (!this.bannerExists && Date.now() < this.bannerNextAttemptAt) {
      this.scheduleRetry(this.bannerNextAttemptAt);
      return;
    }
    await this.registerBannerListeners();
    if (!this.bannerAllowed()) { await this.hideBanner(); return; }
    const needsWindow = this.bannerWindowEndsAt === 0;
    if (needsWindow && !this.frequency.canStartBannerWindow()) { this._bannerHeight.set(0); return; }
    if (!this.bannerExists && !this.frequency.reserveRequest('banner')) {
      this._bannerHeight.set(0);
      this.scheduleRetry(this.frequency.nextRequestAllowedAt('banner'));
      return;
    }
    if (needsWindow) {
      if (!this.frequency.reserveBannerWindow()) { this._bannerHeight.set(0); return; }
      this.bannerWindowEndsAt = Date.now() + AD_POLICY.bannerWindowMs;
      this.bannerWindowTimer = setTimeout(() => {
        this.bannerWindowEndsAt = 0;
        this.bannerNeedsNewVisit = true;
        void this.hideBanner();
      }, AD_POLICY.bannerWindowMs);
    }
    // This space is outside the router outlet: content can never scroll underneath the ad.
    this._bannerHeight.set(Math.max(this.bannerHeight(), AD_POLICY.bannerReserveHeight));
    try {
      if (this.bannerExists) {
        if (!this.bannerVisible) await AdMob.resumeBanner();
      } else {
        this.bannerExists = true;
        await this.withTimeout(AdMob.showBanner({
          adId: AD_UNIT_IDS.banner, adSize: BannerAdSize.ADAPTIVE_BANNER,
          position: BannerAdPosition.BOTTOM_CENTER, isTesting: !environment.production,
        }));
      }
      this.bannerVisible = true;
      if (!this.bannerAllowed()) await this.hideBanner();
    } catch (error) {
      this.bannerExists = false;
      this.bannerVisible = false;
      await AdMob.removeBanner().catch(() => undefined);
      this.bannerNextAttemptAt = Date.now() + this.backoff(++this.bannerFailures);
      this.scheduleRetry(this.bannerNextAttemptAt);
      this._bannerHeight.set(0);
      this.log('Banner unavailable.', error);
    }
  }

  private registerBannerListeners(): Promise<void> {
    this.bannerListeners ??= (async () => {
      const registrations = [
        AdMob.addListener(BannerAdPluginEvents.SizeChanged, ({ height }) => {
          if (height > 0 && this.bannerAllowed()) this._bannerHeight.set(Math.max(AD_POLICY.bannerReserveHeight, height));
        }),
        AdMob.addListener(BannerAdPluginEvents.Loaded, () => {
          this.bannerFailures = 0;
          this.queueBanner();
        }),
        AdMob.addListener(BannerAdPluginEvents.FailedToLoad, () => {
          this.bannerExists = false;
          this.bannerVisible = false;
          this._bannerHeight.set(0);
          this.bannerNextAttemptAt = Date.now() + this.backoff(++this.bannerFailures);
          this.scheduleRetry(this.bannerNextAttemptAt);
        }),
      ];
      await Promise.all(registrations.map(async (registration) => {
        const handle = await registration;
        if (this.destroyed) await handle.remove();
        else this.bannerHandles.push(handle);
      }));
    })();
    return this.bannerListeners;
  }

  private invalidateAds(): void {
    this.adGeneration++;
    this.slots.interstitial.loadedAt = null;
    this.slots.rewarded.loadedAt = null;
    if (this.bannerExists) void AdMob.removeBanner().catch(() => undefined);
    this.bannerExists = false;
    this.bannerVisible = false;
  }

  private backoff(failures: number): number {
    return Math.min(AD_POLICY.retryMaxMs, AD_POLICY.retryBaseMs * Math.pow(2, Math.min(failures - 1, 5)));
  }

  private scheduleRetry(at: number): void {
    if (!this.isNative || !this.foreground() || !environment.features.adsEnabled || this.retryAt <= at) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryAt = at;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      this.retryAt = Infinity;
      if (this.foreground()) void this.initialize().then(() => { this.preloadFormats(); this.queueBanner(); });
    }, Math.max(1000, at - Date.now()));
  }

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([promise, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Ad load timed out')), AD_LOAD_TIMEOUT_MS);
      })]);
    } finally { if (timer) clearTimeout(timer); }
  }

  private log(...args: unknown[]): void {
    if (!environment.production) console.log('[AdMob]', ...args);
  }
}
