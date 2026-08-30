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
  async showRewardedAd(): Promise<RewardedAdResult> {
    if (!environment.features.rewardedAdsEnabled) {
      return { granted: false, reason: 'Ads are disabled in this build.' };
    }

    await this.delay(800);
    // In dev, mock ads always succeed so gameplay flows can be exercised end to end.
    return { granted: true };
  }

  async showInterstitialAd(): Promise<void> {
    if (!environment.features.interstitialAdsEnabled) return;
    await this.delay(400);
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
