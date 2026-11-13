import { signal } from '@angular/core';

export interface RewardedAdResult {
  granted: boolean;
  reason?: string;
}

export interface InterstitialBreakpoint {
  roundId: string;
  canShow: () => boolean;
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
  protected readonly _bannerHeight = signal(0);
  readonly bannerHeight = this._bannerHeight.asReadonly();
  protected readonly _privacyOptionsRequired = signal(false);
  readonly privacyOptionsRequired = this._privacyOptionsRequired.asReadonly();
  protected readonly _fullScreenShowing = signal(false);
  readonly fullScreenShowing = this._fullScreenShowing.asReadonly();

  /** Boots the underlying ad SDK and starts preloading interstitial/rewarded ads.
   * Safe to call multiple times — implementations memoize the underlying init call.
   * Call once, as early as possible (app boot), so ads are already loaded by the time a
   * screen wants to show one. */
  abstract initialize(): Promise<void>;

  abstract showRewardedAd(canShow?: () => boolean): Promise<RewardedAdResult>;

  /** Call once per finished round, before result-screen navigation buttons are shown. */
  abstract maybeShowInterstitialAtBreakpoint(breakpoint: InterstitialBreakpoint): Promise<void>;

  abstract setScreen(path: string): void;
  abstract showPrivacyOptions(): Promise<boolean>;

  abstract showBanner(): Promise<void>;
  abstract hideBanner(): Promise<void>;
}
