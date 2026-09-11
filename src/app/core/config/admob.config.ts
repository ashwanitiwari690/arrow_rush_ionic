/**
 * Centralized AdMob configuration — the ONLY place ad unit IDs live. Every ad call in the
 * app goes through `AdMobService`, which reads its IDs from here, so going live later is a
 * one-line-per-format swap in this file and nowhere else.
 *
 * The IDs below are Google's official public sample ad unit IDs. They always serve a
 * clearly labeled "Test Ad" and are safe to ship during development — using real ad unit
 * IDs before an app is reviewed/approved risks the AdMob account being flagged for invalid
 * traffic. See https://developers.google.com/admob/android/test-ads
 *
 * BEFORE RELEASING TO PRODUCTION:
 * 1. Create a real AdMob app for this project's exact package ID (com.arrowrush.game) in
 *    the AdMob console, and create real Banner / Interstitial / Rewarded ad units under it.
 * 2. Replace the three IDs in AD_UNIT_IDS below with those real ad unit IDs.
 * 3. Replace the placeholder `admob_app_id` string in
 *    android/app/src/main/res/values/strings.xml with the real AdMob App ID (it currently
 *    holds Google's public sample App ID, `ca-app-pub-3940256099942544~3347511713`, purely
 *    so the SDK has something valid to initialize against during development). Never reuse
 *    another app's App ID — it's tied to one exact app listing and misattributes revenue.
 * 4. Remove `initializeForTesting: true` from the `AdMob.initialize()` call in
 *    AdMobService — see that file.
 * 5. Add a GDPR/UMP consent flow (`AdMob.requestConsentInfo` / `showConsentForm`) before
 *    requesting any ad if the app will have EU/UK users — not implemented here.
 */
export const AD_UNIT_IDS = {
  banner: 'ca-app-pub-3940256099942544/6300978111',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
} as const;

/** How long (ms) to wait for an ad to finish loading before giving up on showing it. */
export const AD_LOAD_TIMEOUT_MS = 4000;
