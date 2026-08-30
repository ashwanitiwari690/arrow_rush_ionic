export interface RewardedAdResult {
  granted: boolean;
  reason?: string;
}

/**
 * Abstraction every screen depends on instead of an ad SDK directly. The concrete
 * implementation is swapped in one place — see AppModule's `{ provide: AdService, useClass: ... }`
 * — so replacing MockAdService with a real AdMobService later touches no call site.
 *
 * Reward MUST only be granted from a confirmed callback (see MockAdService for the shape
 * a real implementation has to preserve): never award anything just because an ad started
 * loading or showing.
 */
export abstract class AdService {
  abstract showRewardedAd(): Promise<RewardedAdResult>;
  abstract showInterstitialAd(): Promise<void>;
  abstract showBanner(): Promise<void>;
  abstract hideBanner(): Promise<void>;
}
