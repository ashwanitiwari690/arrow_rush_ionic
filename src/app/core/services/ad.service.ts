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
  /** Boots the underlying ad SDK and starts preloading interstitial/rewarded ads.
   * Safe to call multiple times — implementations memoize the underlying init call.
   * Call once, as early as possible (app boot), so ads are already loaded by the time a
   * screen wants to show one. */
  abstract initialize(): Promise<void>;

  abstract showRewardedAd(): Promise<RewardedAdResult>;

  /** Always shows an interstitial (subject to one loading in time), for a deliberate
   * one-off breakpoint. Prefer `maybeShowInterstitialAtBreakpoint` for a spot the player
   * revisits constantly, so interstitials stay frequency-capped. */
  abstract showInterstitialAd(): Promise<void>;

  /** Call at a natural "leaving a finished/failed round" breakpoint. Shows an interstitial
   * only once every `environment.ads.interstitialLevelInterval` calls, so a spot the player
   * revisits constantly (e.g. every level completion) doesn't breach AdMob's full-screen-ad
   * frequency policies. */
  abstract maybeShowInterstitialAtBreakpoint(): Promise<void>;

  abstract showBanner(): Promise<void>;
  abstract hideBanner(): Promise<void>;
}
