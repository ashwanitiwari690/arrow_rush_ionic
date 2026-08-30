# Arrow Rush

**Escape the Blocks!** — an original Ionic Angular puzzle game where colored arrow blocks must be
slid off the board in their pointing direction to clear each level.

## Environment

- Node.js: **v24.19.0** (do not downgrade)
- npm: 11.17.0
- Angular: 22.0.1
- Ionic Angular: ^9.0.0
- Capacitor: 8.5.0
- TypeScript: ~6.0.0

This project was scaffolded with the Ionic CLI (`ionic start`, Angular type, Capacitor
integration, blank template) directly on the versions above — no downgrades were needed for
Node 24 compatibility. Components/pages follow the same non-standalone NgModule + lazy-route
pattern the scaffold ships with (see `AppRoutingModule` and each feature's own `*.module.ts`).

## Development

```bash
npm install
npm start          # ng serve, http://localhost:4200
```

## Tests

```bash
npm test
```

Unit tests focus on the parts that are riskiest to get wrong silently: the puzzle engine
(movement, collision/blocked paths, undo, level completion, scoring) and the anti-duplicate
reward guard in `LocalGameRewardApiService` (a repeated `idempotencyKey` — from a double tap or
a retried callback — must never credit coins twice). See `src/app/core/game-engine/*.spec.ts`
and `src/app/core/services/{coin,local-game-reward-api}.service.spec.ts`.

## Production build

```bash
npm run build       # ng build (production is the default configuration), output in ./www
```

## Android build

```bash
npm run build
npx cap sync android   # already added; re-run after any web build to refresh android/app/src/main/assets
npx cap open android    # requires Android Studio + SDK, not verifiable from this environment
```

The `android/` platform is already added and synced against the current build (app name "Arrow
Rush", package `com.arrowrush.game`). Building/signing the actual APK requires Android Studio and
the Android SDK on the machine doing the build.

## Level data and the generator

100 levels ship in `src/assets/levels/level-*.json`, indexed by `levels-index.json` for the level
map screen. Rather than hand-authoring puzzles or dropping blocks in fully at random (which risks
producing an unsolvable board), `scripts/generate-levels.mjs` builds each level with a **reverse
construction** technique: blocks are placed on the grid in the reverse of their intended escape
order, so every block's exit path only ever has to dodge obstacles and blocks that are already
down — which guarantees at least one valid solve order exists by construction, while still
letting difficulty (grid size, block/obstacle counts, time limit) scale smoothly across 100
levels via `EASY → MEDIUM → HARD → EXPERT`. The same algorithm (minus the JSON writing) powers the
in-game Shuffle power-up (`ShuffleService`), so a shuffled board is never a soft-lock either.

```bash
npm run levels:generate   # regenerate the pack (bump COUNT in the script to grow past 1000)
npm run levels:verify     # brute-force re-check every generated level is actually solvable
```

## Game architecture

- `src/app/core/models/` — `game.models.ts` (board/block/level types) and `economy.models.ts`
  (coins, progress, achievements, redemption).
- `src/app/core/game-engine/` — the puzzle rules, independent of Ionic/UI:
  - `move-validator.service.ts` — path/collision math.
  - `game-engine.service.ts` — pure state transitions (`initializeLevel`, `moveBlock`, `undo`,
    `isLevelComplete`, `calculateScore`, `getHintBlockId`).
  - `game-state.service.ts` — the reactive (signal-based) session wrapper components read from.
  - `shuffle.service.ts` — solvable re-layout for the Shuffle power-up.
- `src/app/core/services/` — everything else: `storage.service.ts` (the only file that touches
  `@capacitor/preferences`), `level.service.ts`, `coin.service.ts`, `score.service.ts`,
  `powerup.service.ts`, `theme.service.ts`, `lives.service.ts`, `game-timer.service.ts`,
  `sound.service.ts` (synthesizes short tones via the Web Audio API instead of shipping audio
  assets), `settings.service.ts`, `achievement.service.ts`, `daily-challenge.service.ts`,
  `ad.service.ts` / `mock-ad.service.ts`, `game-reward-api.service.ts` /
  `local-game-reward-api.service.ts`, `config.service.ts` (loads `assets/config/*.json`).
- `src/app/game/` — the puzzle board and in-game UI (`game-board`, `arrow-block`,
  `obstacle-tile`, `game-header`, `level-complete-panel`, `game-over-panel`, `pause-panel`) plus
  the `game-play` page that orchestrates them.
- `src/app/levels/`, `home/`, `store/`, `profile/`, `settings/`, `daily-challenge/`, `themes/` —
  lazy-loaded feature pages.
- `src/app/shared/` — cross-page components (`coin-balance`, `level-card`, `theme-card`,
  `power-up-button`, `confirm-dialog`, `ad-banner`).
- `src/assets/config/` — tunable numbers (power-up costs/starting counts, theme prices, reward
  amounts, coin conversion placeholders) so none of that is hardcoded in components.

State is Angular signals throughout — no NgRx, no mixing with RxJS subjects for the same state.

## Coin & reward architecture

Score and coins are tracked separately: `ScoreService` only ever reads best scores back from
`LevelService`'s progress records, and `CoinService` is the *only* place that mutates the coin
balance, always paired with a `CoinTransaction` (type, amount, source, timestamp) for an audit
trail. Coins are local-only today, but the seam for a future centralized backend is already in
place: `GameRewardApiService` (abstract) / `LocalGameRewardApiService` (the local stand-in,
registered in `AppModule`) mirrors the shape the real API will need — `submitGameReward` takes a
`gameCode` (`ARROW_RUSH`) and an `idempotencyKey`, and duplicate keys are rejected rather than
re-credited. `redeemCoins` throws until `environment.features.redemptionEnabled` is turned on *and*
a real backend is wired in — the frontend never computes a rupee amount itself; it only ever
reads `amountCredited` back from a response. Swapping in the real backend later means writing one
new class and changing one `provide` line in `AppModule` — no call sites change.

## Ads architecture

Every ad call goes through the abstract `AdService` (`showRewardedAd` / `showInterstitialAd` /
`showBanner` / `hideBanner`); `MockAdService` is the only implementation wired up right now
(`AppModule`'s `{ provide: AdService, useClass: MockAdService }`), and it only resolves a granted
reward from a single confirmed point — matching the shape a real AdMob callback has — so no
caller ever gets rewarded just because an ad started loading. All ad features
(`features.adsEnabled`, `rewardedAdsEnabled`, `interstitialAdsEnabled`, `bannerAdsEnabled`) default
to `false` in both `environment.ts` and `environment.prod.ts`.

## What's intentionally not real yet

- **AdMob**: only the mock provider exists; wiring a real AdMob Capacitor plugin is future work
  behind the same `AdService` interface.
- **Redemption backend**: `LocalGameRewardApiService.redeemCoins` always throws — there is no
  server to talk to.
- **Push notifications**, **Hindi localization strings**: the `AppSettings`/language plumbing
  exists (`SettingsService`), but only English copy is written in the templates today.
