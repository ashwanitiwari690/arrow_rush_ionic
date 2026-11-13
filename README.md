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
Node 24 compatibility. Pages retain NgModules and lazy routes. Shared widgets are standalone
and imported only by the screens that use them. Ionic widgets use their component-specific
entry points so unused controls and the full lazy-widget registry are excluded from the build.

## Development

```bash
npm install
npm start          # ng serve, http://localhost:4200
```

## Tests

```bash
npm test
npm run lint
npm run build
npm run test:smoke  # headless browser check; requires installed Chrome (or CHROME_PATH)
```

Unit tests focus on the parts that are riskiest to get wrong silently: the puzzle engine
(movement, collision/blocked paths, undo, level completion, scoring) and the anti-duplicate
reward guard in `LocalGameRewardApiService` (a repeated `idempotencyKey` — from a double tap or
a retried callback — must never credit coins twice). See `src/app/core/game-engine/*.spec.ts`
and `src/app/core/services/{coin,local-game-reward-api}.service.spec.ts`.

Audio uses one shared Web Audio context. Original menu, puzzle, and daily-challenge tracks
are rendered once per session and played as cached loops, with separate saved effects and
music volumes in Settings. Playback starts after a user gesture. Pausing, leaving gameplay,
or backgrounding the app stops the game music; returning from the background requires Resume.

The browser check covers audio playback, volume controls, responsive boards, moves, paused
navigation through Settings, completion, and the full scrolling level map. Screenshots are saved
in `.tmp/smoke/`. Android speaker quality and native interruption behavior still need a
device check after `npx cap sync android`.

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
Rush", package `com.admobility.arrowrush`). Building/signing the actual APK requires Android Studio and
the Android SDK on the machine doing the build.

## Level data and the generator

520 levels ship in `src/assets/levels/level-*.json`, indexed by `levels-index.json` for the level
map screen. Rather than hand-authoring puzzles or dropping blocks in fully at random (which risks
producing an unsolvable board), `scripts/generate-levels.mjs` builds each level with a **reverse
construction** technique: blocks are placed on the grid in the reverse of their intended escape
order, so every block's exit path only ever has to dodge obstacles and blocks that are already
down — which guarantees at least one valid solve order exists by construction, while still
letting difficulty (grid size, block/obstacle counts, time limit) scale smoothly across 520
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
  `power-up-button`, `coin-icon`, `ad-banner`), imported directly without a catch-all module.
- `src/assets/config/` — tunable numbers (power-up costs/starting counts, theme prices, reward
  amounts, coin conversion placeholders) so none of that is hardcoded in components.

State is Angular signals throughout — no NgRx, no mixing with RxJS subjects for the same state.

Startup uses Angular's AOT `platformBrowser` bootstrap. Idle preloading warms only gameplay
and the level map; Store, Profile, Settings, Themes, and Daily Challenge load when opened.
The full 520-level map precomputes row alignment when its index changes. Shuffle reuses the
move validator's occupancy scan instead of allocating a path array for every placement attempt.
TypeScript rejects unused locals and parameters during builds to help prevent dead code returning.

## Coin & reward architecture

Score and coins are tracked separately: `ScoreService` only ever reads best scores back from
`LevelService`'s progress records, and `CoinService` is the *only* place that mutates the coin
balance, always paired with a `CoinTransaction` (type, amount, source, timestamp) for an audit
trail. `GameRewardApiService` / `LocalGameRewardApiService` credits gameplay rewards locally
with an idempotency key to reject repeated completion submissions. Production redemption
remains enabled: Profile submits the existing game code, mobile number, coins, and idempotency
key to `POST {apiBaseUrl}/redeem`. The UI displays the backend's `amountCredited` in rupees and
deducts only its confirmed `coinsRedeemed`; it never calculates a cash payout locally.
Rewarded ads grant separate game-only items, so they do not add to this redeemable balance.

## Ads architecture

`AppModule` provides the native `AdMobService` behind `AdService`. It requests UMP consent
eligibility before loading ads, exposes required privacy options in Settings, preloads and
expires full-screen ads, backs off on no-fill, and serializes full-screen presentations.
`AdFrequencyService` persists rolling hourly/daily display and app-initiated request caps.
Interstitials require five distinct rounds and five minutes between full-screen ads, with
at most three per hour and six per day. Rewarded ads have a one-minute cooldown, six-per-hour
and twelve-per-day caps; all full-screen formats share a six-per-hour/twelve-per-day cap.
Interstitials are considered once per finished
round, before result-screen navigation buttons; they are skipped if not already ready.
A single adaptive banner uses a reserved footer outside the router outlet on menu screens.
Native banners have one-minute exposure windows, a ten-minute interval between windows,
and require a new eligible menu visit after expiry. Request failures back off for 5-30 minutes.
Rewarded ads grant non-transferable in-game items, never cash-redeemable coins. Production
browser previews cannot earn mock ad rewards. Development builds use Google's sample units.

See [the release checklist](docs/admob/RELEASE-CHECKLIST.md) for console configuration,
privacy messages, app-ads.txt publication, traffic monitoring, and device QA. No placement
or frequency setting guarantees revenue or immunity from account enforcement.

```powershell
npm.cmd run build -- --configuration development  # existing environment.ts uses Google test units
.\node_modules\.bin\cap.cmd sync android
```

After QA, run the normal production build and resync before preparing a signed release.
Only the existing `environment.ts` and `environment.prod.ts` are used. Developer/test-device
hashes can be added to `ads.testingDevices` in these files, or registered through AdMob.
Never test your own live ads. See the checklist for account-level serving-limit recovery:
local caps do not remove Google's invalid-traffic restriction.

## What's intentionally not real yet

- **AdMob console access**: account readiness, consent-message publication, website
  app-ads.txt verification, and live device impressions cannot be confirmed by a local build.
- **Wallet verification**: redemption calls the configured external reward API; its security,
  historical balances, and payment processing are outside this frontend's verification.
- **Push notifications**, **Hindi localization strings**: the `AppSettings`/language plumbing
  exists (`SettingsService`), but only English copy is written in the templates today.
