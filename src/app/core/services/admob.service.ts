import { Injectable, inject } from '@angular/core';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import {
  AdMob,
  BannerAdOptions,
  BannerAdPluginEvents,
  BannerAdPosition,
  BannerAdSize,
  InterstitialAdPluginEvents,
  RewardAdPluginEvents,
} from '@capacitor-community/admob';
import { AdService, RewardedAdResult } from './ad.service';
import { MockAdService } from './mock-ad.service';
import { AD_UNIT_IDS, AD_LOAD_TIMEOUT_MS } from '../config/admob.config';
import { environment } from '../../../environments/environment';

/**
 * Real AdMob-backed implementation of AdService, using @capacitor-community/admob. Ad unit
 * IDs are never hardcoded here — see admob.config.ts, the single place to swap in real IDs.
 *
 * Ads only run on native platforms (Android) — the plugin has no meaningful web
 * implementation, so every native call here is gated behind `Capacitor.isNativePlatform()`
 * and delegates to MockAdService in a desktop browser (`ng serve`), which keeps the UI
 * testable without a device while guaranteeing web can never grant a real reward.
 */
@Injectable({ providedIn: 'root' })
export class AdMobService extends AdService {
  private readonly mock = inject(MockAdService);

  private readonly isNative = Capacitor.isNativePlatform();

  private initPromise?: Promise<void>;
  private bannerVisible = false;

  private interstitialReady = false;
  private interstitialLoading?: Promise<void>;
  private roundsSinceInterstitial = 0;

  private rewardedReady = false;
  private rewardedLoading?: Promise<void>;
  // Guards against a second tap starting a second rewarded flow (and thus a second grant)
  // while one is already in flight — belt-and-suspenders alongside each caller's own
  // "isProcessingAd" UI guard.
  private rewardInFlight = false;

  initialize(): Promise<void> {
    if (!this.isNative) return this.mock.initialize();
    if (!this.initPromise) {
      this.initPromise = AdMob.initialize({ initializeForTesting: true })
        .then(() => {
          void this.preloadInterstitial();
          void this.preloadRewarded();
        })
        .catch(() => {
          // Initialization failure (e.g. no Play Services) leaves every ad call below to
          // fail its own preload/show attempt gracefully rather than throwing here.
        });
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

    try {
      await this.initialize();
      if (!this.rewardedReady) {
        await Promise.race([this.preloadRewarded(), this.timeout()]);
      }
      if (!this.rewardedReady) {
        return { granted: false, reason: 'No ad is available right now. Please try again shortly.' };
      }

      this.rewardedReady = false;
      const granted = await this.awaitRewardConfirmation();
      void this.preloadRewarded();

      return granted ? { granted: true } : { granted: false, reason: 'Ad was closed before it finished.' };
    } finally {
      this.rewardInFlight = false;
    }
  }

  async showInterstitialAd(): Promise<void> {
    if (!environment.features.interstitialAdsEnabled) return;
    if (!this.isNative) return this.mock.showInterstitialAd();

    await this.initialize();
    if (!this.interstitialReady) {
      await Promise.race([this.preloadInterstitial(), this.timeout()]);
    }
    if (!this.interstitialReady) return;

    this.interstitialReady = false;
    try {
      await this.awaitInterstitialDismissal();
    } finally {
      void this.preloadInterstitial();
    }
  }

  async maybeShowInterstitialAtBreakpoint(): Promise<void> {
    if (!environment.features.interstitialAdsEnabled) return;
    this.roundsSinceInterstitial++;
    if (this.roundsSinceInterstitial < environment.ads.interstitialLevelInterval) return;
    this.roundsSinceInterstitial = 0;
    await this.showInterstitialAd();
  }

  async showBanner(): Promise<void> {
    if (!environment.features.bannerAdsEnabled) return;
    if (!this.isNative) return this.mock.showBanner();

    await this.initialize();
    if (this.bannerVisible) return;

    const options: BannerAdOptions = {
      adId: AD_UNIT_IDS.banner,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
    };

    try {
      this.bannerVisible = true;
      await AdMob.addListener(BannerAdPluginEvents.FailedToLoad, () => {
        this.bannerVisible = false;
      });
      await AdMob.showBanner(options);
    } catch {
      this.bannerVisible = false;
    }
  }

  async hideBanner(): Promise<void> {
    if (!this.isNative) return this.mock.hideBanner();
    if (!this.bannerVisible) return;

    this.bannerVisible = false;
    try {
      await AdMob.removeBanner();
    } catch {
      // Nothing to clean up if the native banner never actually loaded.
    }
  }

  private async preloadInterstitial(): Promise<void> {
    if (this.interstitialReady || this.interstitialLoading) return this.interstitialLoading;

    this.interstitialLoading = (async () => {
      try {
        await AdMob.prepareInterstitial({ adId: AD_UNIT_IDS.interstitial });
        this.interstitialReady = true;
      } catch {
        this.interstitialReady = false;
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
        await AdMob.prepareRewardVideoAd({ adId: AD_UNIT_IDS.rewarded });
        this.rewardedReady = true;
      } catch {
        this.rewardedReady = false;
      } finally {
        this.rewardedLoading = undefined;
      }
    })();

    return this.rewardedLoading;
  }

  /**
   * Resolves true ONLY once AdMob confirms the reward was actually earned — either via the
   * plugin's own `showRewardVideoAd()` promise (which resolves with the earned reward) or
   * the `Rewarded` event, whichever arrives first. The user backing out early fires
   * `Dismissed` (no `Rewarded` first) or `FailedToShow`, both of which resolve false rather
   * than leaving the caller hanging. This is the one method every coin/reward grant in the
   * app must gate on — never grant from a button tap or the ad merely starting.
   */
  private awaitRewardConfirmation(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const handles: Promise<PluginListenerHandle>[] = [];
      const cleanup = () => handles.forEach((h) => h.then((handle) => handle.remove()).catch(() => {}));
      const finish = (granted: boolean) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(granted);
      };

      handles.push(AdMob.addListener(RewardAdPluginEvents.Rewarded, () => finish(true)));
      handles.push(AdMob.addListener(RewardAdPluginEvents.Dismissed, () => finish(false)));
      handles.push(AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => finish(false)));

      AdMob.showRewardVideoAd()
        .then(() => finish(true))
        .catch(() => finish(false));
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
}
