import { Injectable, inject } from '@angular/core';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import {
  AdMob,
  AdmobConsentStatus,
  BannerAdOptions,
  BannerAdPluginEvents,
  BannerAdPosition,
  BannerAdSize,
  InterstitialAdPluginEvents,
  RewardAdPluginEvents,
} from '@capacitor-community/admob';
import { AdService, RewardedAdResult } from './ad.service';
import { MockAdService } from './mock-ad.service';
import { MusicService } from './music.service';
import { AD_UNIT_IDS, AD_LOAD_TIMEOUT_MS } from '../config/admob.config';
import { environment } from '../../../environments/environment';

/**
 * Real AdMob-backed implementation of AdService, using @capacitor-community/admob.
 * Ad unit IDs are resolved dynamically based on environment (see admob.config.ts).
 *
 * Ads only run on native platforms (Android) — gated behind `Capacitor.isNativePlatform()`
 * and delegates to MockAdService in a desktop browser (`ng serve`), keeping the UI
 * testable without a device while guaranteeing web can never grant a real reward.
 */
@Injectable({ providedIn: 'root' })
export class AdMobService extends AdService {
  private readonly mock = inject(MockAdService);
  private readonly music = inject(MusicService);

  private readonly isNative = Capacitor.isNativePlatform();

  private initPromise?: Promise<void>;
  private bannerVisible = false;
  private bannerPendingHide = false;
  private bannerListenersRegistered = false;

  private interstitialReady = false;
  private interstitialLoading?: Promise<void>;
  private roundsSinceInterstitial = 0;

  /** Minimum interval (ms) between full-screen ads. Prevents high ad density and policy flags. */
  private readonly MIN_INTERSTITIAL_COOLDOWN_MS = 75000; // 75 seconds
  // Start with current timestamp so users get a clean, ad-free experience when opening the game
  private lastFullScreenAdTime = Date.now();

  private rewardedReady = false;
  private rewardedLoading?: Promise<void>;
  // Guards against duplicate taps triggering parallel rewarded ad flows
  private rewardInFlight = false;

  initialize(): Promise<void> {
    if (!this.isNative) return this.mock.initialize();
    if (!this.initPromise) {
      this.initPromise = (async () => {
        try {
          this.log(`Initializing Mobile Ads SDK (Production: ${environment.production})`);

          // 1. Google UMP Consent Flow (Required for EEA/UK compliance)
          try {
            const consentInfo = await AdMob.requestConsentInfo();
            this.log('UMP consent status:', consentInfo.status, 'form available:', consentInfo.isConsentFormAvailable);

            if (consentInfo.isConsentFormAvailable && consentInfo.status === AdmobConsentStatus.REQUIRED) {
              await AdMob.showConsentForm();
              this.log('UMP consent form completed by user.');
            }
          } catch (consentErr) {
            this.log('UMP consent check skipped or unavailable:', consentErr);
          }

          // 2. Initialize AdMob with official testing mode flag based on build
          await AdMob.initialize({ initializeForTesting: !environment.production });
          this.log('AdMob SDK initialized successfully.');

          // 3. Preload initial full-screen ads in background for instant readiness
          void this.preloadInterstitial();
          void this.preloadRewarded();
        } catch (err) {
          this.log('AdMob initialization error:', err);
        }
      })();
    }
    return this.initPromise;
  }

  async showRewardedAd(): Promise<RewardedAdResult> {
    if (!environment.features.rewardedAdsEnabled) {
      return { granted: false, reason: 'Ads are disabled in this build.' };
    }
    if (!this.isNative) return this.mock.showRewardedAd();

    if (this.rewardInFlight) {
      return { granted: false, reason: 'An ad is already in progress.' };
    }
    this.rewardInFlight = true;
    this.music.pause();

    try {
      await this.initialize();
      if (!this.rewardedReady) {
        this.log('Rewarded ad not preloaded, attempting just-in-time load...');
        await Promise.race([this.preloadRewarded(), this.timeout()]);
      }
      if (!this.rewardedReady) {
        this.log('Rewarded ad unavailable at show time.');
        return { granted: false, reason: 'No ad is available right now. Please try again shortly.' };
      }

      this.rewardedReady = false;
      const granted = await this.awaitRewardConfirmation();

      // Reset cooldown and counter: user just watched a rewarded ad, so never follow up with an interstitial
      this.lastFullScreenAdTime = Date.now();
      this.roundsSinceInterstitial = 0;
      void this.preloadRewarded();

      return granted ? { granted: true } : { granted: false, reason: 'Ad was closed before it finished.' };
    } finally {
      this.rewardInFlight = false;
      this.music.resume();
    }
  }

  async showInterstitialAd(): Promise<void> {
    if (!environment.features.interstitialAdsEnabled) return;
    if (!this.isNative) return this.mock.showInterstitialAd();

    await this.initialize();
    if (!this.interstitialReady) {
      this.log('Interstitial not preloaded, attempting just-in-time load...');
      await Promise.race([this.preloadInterstitial(), this.timeout()]);
    }
    if (!this.interstitialReady) {
      this.log('Interstitial ad not ready, skipping breakpoint cleanly.');
      return;
    }

    this.interstitialReady = false;
    this.lastFullScreenAdTime = Date.now();
    this.music.pause();
    try {
      await this.awaitInterstitialDismissal();
    } finally {
      this.lastFullScreenAdTime = Date.now();
      this.music.resume();
      void this.preloadInterstitial();
    }
  }

  async maybeShowInterstitialAtBreakpoint(): Promise<void> {
    if (!environment.features.interstitialAdsEnabled) return;

    this.roundsSinceInterstitial++;

    // 1. Must satisfy rounds interval threshold (e.g. every 3 levels)
    if (this.roundsSinceInterstitial < environment.ads.interstitialLevelInterval) {
      this.log(`Interstitial skipped: round ${this.roundsSinceInterstitial}/${environment.ads.interstitialLevelInterval}`);
      return;
    }

    // 2. Must satisfy time cooldown (at least 75 seconds between full-screen ads)
    const now = Date.now();
    const elapsedSinceLastAd = now - this.lastFullScreenAdTime;
    if (elapsedSinceLastAd < this.MIN_INTERSTITIAL_COOLDOWN_MS) {
      this.log(`Interstitial skipped: cooldown active (${Math.round((this.MIN_INTERSTITIAL_COOLDOWN_MS - elapsedSinceLastAd) / 1000)}s remaining)`);
      return;
    }

    this.roundsSinceInterstitial = 0;
    this.lastFullScreenAdTime = now;
    await this.showInterstitialAd();
  }

  async showBanner(): Promise<void> {
    if (!environment.features.bannerAdsEnabled) return;
    if (!this.isNative) return this.mock.showBanner();

    this.bannerPendingHide = false;
    await this.initialize();
    if (this.bannerVisible || this.bannerPendingHide) return;

    const options: BannerAdOptions = {
      adId: AD_UNIT_IDS.banner,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
    };

    try {
      if (!this.bannerListenersRegistered) {
        this.bannerListenersRegistered = true;
        await AdMob.addListener(BannerAdPluginEvents.FailedToLoad, (err) => {
          this.log('Banner failed to load:', err);
          this.bannerVisible = false;
        });
        await AdMob.addListener(BannerAdPluginEvents.Loaded, () => {
          this.log('Banner loaded successfully.');
          this.bannerVisible = true;
        });
      }

      await AdMob.showBanner(options);
      if (this.bannerPendingHide) {
        await AdMob.removeBanner();
        this.bannerVisible = false;
      } else {
        this.bannerVisible = true;
        this.log('Banner displayed.');
      }
    } catch (err) {
      this.log('Error showing banner:', err);
      this.bannerVisible = false;
    }
  }

  async hideBanner(): Promise<void> {
    if (!this.isNative) return this.mock.hideBanner();
    this.bannerPendingHide = true;
    if (!this.bannerVisible) return;

    this.bannerVisible = false;
    try {
      await AdMob.removeBanner();
      this.log('Banner hidden.');
    } catch (err) {
      this.log('Error removing banner:', err);
    }
  }

  private async preloadInterstitial(): Promise<void> {
    if (this.interstitialReady || this.interstitialLoading) return this.interstitialLoading;

    this.interstitialLoading = (async () => {
      try {
        const adId = AD_UNIT_IDS.interstitial;
        this.log('Preloading interstitial with adId:', adId);
        await AdMob.prepareInterstitial({ adId });
        this.interstitialReady = true;
        this.log('Interstitial ready.');
      } catch (err) {
        this.interstitialReady = false;
        this.log('Interstitial preload failed:', err);
      } finally {
        this.interstitialLoading = undefined;
      }
    })();

    return this.interstitialLoading;
  }

  private async preloadRewarded(): Promise<void> {
    if (this.rewardedReady || this.rewardedLoading) return this.rewardedLoading;

    this.rewardedLoading = (async () => {
      try {
        const adId = AD_UNIT_IDS.rewarded;
        this.log('Preloading rewarded ad with adId:', adId);
        await AdMob.prepareRewardVideoAd({ adId });
        this.rewardedReady = true;
        this.log('Rewarded ad ready.');
      } catch (err) {
        this.rewardedReady = false;
        this.log('Rewarded preload failed:', err);
      } finally {
        this.rewardedLoading = undefined;
      }
    })();

    return this.rewardedLoading;
  }

  /**
   * Resolves true ONLY once AdMob confirms the reward was actually earned — either via the
   * plugin's own `showRewardVideoAd()` promise (which resolves with the earned reward) or
   * the `Rewarded` event, whichever arrives first.
   *
   * A dismissal timer ensures dismissal events cannot prematurely discard a confirmed reward.
   */
  private awaitRewardConfirmation(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let rewardEarned = false;
      let settled = false;
      let dismissalTimer: ReturnType<typeof setTimeout> | null = null;
      const handles: Promise<PluginListenerHandle>[] = [];
      const cleanup = () => {
        if (dismissalTimer !== null) clearTimeout(dismissalTimer);
        handles.forEach((h) => h.then((handle) => handle.remove()).catch(() => {}));
      };
      const finish = (granted: boolean) => {
        if (settled) return;
        settled = true;
        cleanup();
        this.log('Reward flow finished, granted:', granted);
        resolve(granted);
      };

      // 1. Explicit rewarded event from plugin listener
      handles.push(
        AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
          this.log('RewardAdPluginEvents.Rewarded received.');
          rewardEarned = true;
          finish(true);
        }),
      );

      // 2. Plugin call promise resolution
      AdMob.showRewardVideoAd()
        .then(() => {
          this.log('showRewardVideoAd promise resolved successfully.');
          rewardEarned = true;
          finish(true);
        })
        .catch((err) => {
          this.log('showRewardVideoAd promise error:', err);
          if (!rewardEarned) finish(false);
        });

      // 3. Ad dismissed / closed by user
      handles.push(
        AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
          this.log('RewardAdPluginEvents.Dismissed received. rewardEarned:', rewardEarned);
          if (rewardEarned) {
            finish(true);
          } else {
            // Give 300ms grace period in case Rewarded event arrives right around dismissal
            dismissalTimer = setTimeout(() => {
              finish(rewardEarned);
            }, 300);
          }
        }),
      );

      // 4. Failed to show
      handles.push(
        AdMob.addListener(RewardAdPluginEvents.FailedToShow, (err) => {
          this.log('RewardAdPluginEvents.FailedToShow received:', err);
          if (!rewardEarned) finish(false);
        }),
      );
    });
  }

  private awaitInterstitialDismissal(): Promise<void> {
    return new Promise<void>((resolve) => {
      let settled = false;
      const handles: Promise<PluginListenerHandle>[] = [];
      const cleanup = () => handles.forEach((h) => h.then((handle) => handle.remove()).catch(() => {}));
      const finish = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };

      handles.push(AdMob.addListener(InterstitialAdPluginEvents.Dismissed, finish));
      handles.push(AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, finish));

      AdMob.showInterstitial().catch(finish);
    });
  }

  private timeout(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, AD_LOAD_TIMEOUT_MS));
  }

  private log(...args: unknown[]): void {
    if (!environment.production || (environment as { debug?: boolean }).debug) {
      console.log('[AdMob]', ...args);
    }
  }
}
