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

  coinConversion: {
    minimumRedeemCoins: 1000,
    coinsPerConversion: 1000,
    rupeesPerConversion: 10,
  },

  debug: false,
};
