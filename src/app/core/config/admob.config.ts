import { environment } from '../../../environments/environment';

/**
 * Official Google sample test ad unit IDs for Android.
 * Always serve test ads with 100% fill rate and zero risk of invalid traffic policy penalties.
 * See: https://developers.google.com/admob/android/test-ads
 */
export const TEST_AD_UNIT_IDS = {
  banner: 'ca-app-pub-3940256099942544/6300978111',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
} as const;

/**
 * Live production AdMob ad unit IDs for package `com.admobility.arrowrush`.
 * Used ONLY when `environment.production` is true.
 */
export const PROD_AD_UNIT_IDS = {
  banner: 'ca-app-pub-2030586584805301/7095504267',
  interstitial: 'ca-app-pub-2030586584805301/2109936748',
  rewarded: 'ca-app-pub-2030586584805301/8483773404',
} as const;

/**
 * Resolves the appropriate ad unit ID based on current build environment.
 * Prevents test and production ad configurations from ever being mixed accidentally.
 */
export function getAdUnitId(format: 'banner' | 'interstitial' | 'rewarded'): string {
  return environment.production ? PROD_AD_UNIT_IDS[format] : TEST_AD_UNIT_IDS[format];
}

/**
 * Centralized ad unit ID map with dynamic environment getters.
 */
export const AD_UNIT_IDS = {
  get banner(): string {
    return getAdUnitId('banner');
  },
  get interstitial(): string {
    return getAdUnitId('interstitial');
  },
  get rewarded(): string {
    return getAdUnitId('rewarded');
  },
};

/** How long (ms) to wait for an ad to finish loading before giving up on showing it. */
export const AD_LOAD_TIMEOUT_MS = 8000;
