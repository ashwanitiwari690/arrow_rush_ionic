// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,

  // Identifies this game to the centralized reward/wallet backend.
  gameCode: 'ARROW_RUSH',

  // Same shared Central Game Reward API other games in this family (e.g. Brain Rush) call —
  // gameplay/coins stay fully local; only the /redeem call below actually reaches it.
  apiBaseUrl: 'http://localhost:4227/api/game-rewards',

  // Master switches. Ad formats are wired up via AdMobService (see admob.config.ts for the
  // ad unit IDs — currently Google's public test IDs, safe to ship during development).
  features: {
    adsEnabled: true,
    rewardedAdsEnabled: true,
    interstitialAdsEnabled: true,
    bannerAdsEnabled: true,
    redemptionEnabled: true,
  },

  ads: {
    // How many completed levels between interstitials. Configurable, never a fixed literal in components.
    interstitialLevelInterval: 3,
  },

  earnivo: {
    // Confirms Earnivo's "App Promotion" task (see APP_PROMOTION_VERIFICATION_INTEGRATION.md).
    // This always talks to Earnivo's real API — there is no local/dev stand-in for it,
    // since verification depends on a task actually started in the real Earnivo app.
    appVerification: {
      confirmUrl: 'https://api.admobility.in/api/app-verification/confirm',
      // TODO: paste the API key shown for this campaign in the Earnivo agent panel.
      // Left blank until then — AppVerificationService no-ops without it.
      apiKey: 'ak_57c63e535cdd10dd30bea0c295275b37809006a867be7445',
    },
  },

  // Placeholder only — the frontend must never compute rupee amounts itself.
  // Real values are owned by the centralized backend once redemption goes live.
  coinConversion: {
    minimumRedeemCoins: 1000,
    coinsPerConversion: 1000,
    rupeesPerConversion: 10,
  },

  debug: true,
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
