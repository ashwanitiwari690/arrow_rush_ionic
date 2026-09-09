export const environment = {
  production: true,

  gameCode: 'ARROW_RUSH',

  // TODO: production domain for the Central Game Reward API has not been decided yet —
  // placeholder only, matching the same not-yet-live URL other games in this family use.
  apiBaseUrl: 'https://api.earnivo.app/api/game-rewards',

  features: {
    adsEnabled: false,
    rewardedAdsEnabled: false,
    interstitialAdsEnabled: false,
    bannerAdsEnabled: false,
    redemptionEnabled: true,
  },

  ads: {
    interstitialLevelInterval: 3,
  },

  earnivo: {
    // Confirms Earnivo's "App Promotion" task (see APP_PROMOTION_VERIFICATION_INTEGRATION.md).
    appVerification: {
      confirmUrl: 'https://api.earnivo.app/api/app-verification/confirm',
      // TODO: paste the API key shown for this campaign in the Earnivo agent panel.
      // Left blank until then — AppVerificationService no-ops without it.
      apiKey: '',
    },
  },

  coinConversion: {
    minimumRedeemCoins: 1000,
    coinsPerConversion: 1000,
    rupeesPerConversion: 10,
  },

  debug: false,
};
