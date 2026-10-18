import { Injectable, inject } from '@angular/core';
import { AdService, RewardedAdResult } from './ad.service';
import { environment } from '../../../environments/environment';

/**
 * Development/offline stand-in for AdMob. Simulates realistic load + watch latency and
 * always resolves the reward from a single "confirmed" point, matching the shape a real
 * AdMob `RewardedAdOptions` completion callback would have — so swapping in a real
 * AdMobService later is a drop-in replacement with no caller changes.
 */
@Injectable({ providedIn: 'root' })
export class MockAdService extends AdService {
  private roundsSinceInterstitial = 0;
  private readonly MIN_INTERSTITIAL_COOLDOWN_MS = 75000;
  private lastFullScreenAdTime = Date.now();

  async initialize(): Promise<void> {
    // Nothing to boot for the mock provider.
  }

  async showRewardedAd(): Promise<RewardedAdResult> {
    if (!environment.features.rewardedAdsEnabled) {
      return { granted: false, reason: 'Ads are disabled in this build.' };
    }

    await this.delay(800);
    this.lastFullScreenAdTime = Date.now();
    this.roundsSinceInterstitial = 0;
    // In dev, mock ads always succeed so gameplay flows can be exercised end to end.
    return { granted: true };
  }

  async showInterstitialAd(): Promise<void> {
    if (!environment.features.interstitialAdsEnabled) return;
    this.lastFullScreenAdTime = Date.now();
    await this.delay(400);
    this.lastFullScreenAdTime = Date.now();
  }

  async maybeShowInterstitialAtBreakpoint(): Promise<void> {
    if (!environment.features.interstitialAdsEnabled) return;
    this.roundsSinceInterstitial++;
    if (this.roundsSinceInterstitial < environment.ads.interstitialLevelInterval) return;

    const now = Date.now();
    if (now - this.lastFullScreenAdTime < this.MIN_INTERSTITIAL_COOLDOWN_MS) return;

    this.roundsSinceInterstitial = 0;
    this.lastFullScreenAdTime = now;
    await this.showInterstitialAd();
  }

  async showBanner(): Promise<void> {
    if (!environment.features.bannerAdsEnabled) return;
  }

  async hideBanner(): Promise<void> {
    // no-op for the mock provider
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
