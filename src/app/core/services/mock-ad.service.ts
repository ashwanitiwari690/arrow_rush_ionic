import { Injectable } from '@angular/core';
import { AdService, InterstitialBreakpoint, RewardedAdResult } from './ad.service';
import { BANNER_SCREENS } from '../config/admob.config';
import { environment } from '../../../environments/environment';

/** Development-only reward simulation. Production web previews never award mock rewards. */
@Injectable({ providedIn: 'root' })
export class MockAdService extends AdService {
  async initialize(): Promise<void> { /* No native SDK in browser previews. */ }

  async showRewardedAd(canShow: () => boolean = () => true): Promise<RewardedAdResult> {
    if (environment.production || !environment.features.adsEnabled || !environment.features.rewardedAdsEnabled) {
      return { granted: false, reason: 'Rewarded ads are available in the installed app.' };
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
    return canShow() ? { granted: true } : { granted: false, reason: 'Ad cancelled.' };
  }

  async maybeShowInterstitialAtBreakpoint(_breakpoint: InterstitialBreakpoint): Promise<void> { /* No live browser ads. */ }
  setScreen(path: string): void {
    this._bannerHeight.set(environment.features.adsEnabled && environment.features.bannerAdsEnabled && BANNER_SCREENS.has(path) ? 50 : 0);
  }
  async showBanner(): Promise<void> { /* Preview only. */ }
  async hideBanner(): Promise<void> { this._bannerHeight.set(0); }
  async showPrivacyOptions(): Promise<boolean> { return false; }
}
