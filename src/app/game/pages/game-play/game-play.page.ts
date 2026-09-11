import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { ImpactStyle } from '@capacitor/haptics';

import { LevelData, PowerUpType } from '../../../core/models/game.models';
import { GameStateService } from '../../../core/game-engine/game-state.service';
import { GameEngineService } from '../../../core/game-engine/game-engine.service';
import { ShuffleService } from '../../../core/game-engine/shuffle.service';
import { GameTimerService } from '../../../core/services/game-timer.service';
import { LevelService } from '../../../core/services/level.service';
import { CoinService } from '../../../core/services/coin.service';
import { PowerupService } from '../../../core/services/powerup.service';
import { LivesService } from '../../../core/services/lives.service';
import { ScoreService } from '../../../core/services/score.service';
import { AchievementService } from '../../../core/services/achievement.service';
import { DailyChallengeService } from '../../../core/services/daily-challenge.service';
import { ConfigService } from '../../../core/services/config.service';
import { SoundService } from '../../../core/services/sound.service';
import { HapticsService } from '../../../core/services/haptics.service';
import { AdService } from '../../../core/services/ad.service';
import { GameRewardApiService } from '../../../core/services/game-reward-api.service';
import { environment } from '../../../../environments/environment';
import { BlockedFeedback } from '../../components/game-board/game-board.component';

const LEVEL_COMPLETE_COINS = 10;

@Component({
  selector: 'app-game-play',
  templateUrl: './game-play.page.html',
  styleUrls: ['./game-play.page.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [GameTimerService],
})
export class GamePlayPage implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly levelService = inject(LevelService);
  private readonly coinService = inject(CoinService);
  private readonly powerupService = inject(PowerupService);
  private readonly livesService = inject(LivesService);
  private readonly scoreService = inject(ScoreService);
  private readonly achievementService = inject(AchievementService);
  private readonly dailyChallengeService = inject(DailyChallengeService);
  private readonly configService = inject(ConfigService);
  private readonly soundService = inject(SoundService);
  private readonly hapticsService = inject(HapticsService);
  private readonly adService = inject(AdService);
  private readonly rewardApi = inject(GameRewardApiService);
  private readonly engine = inject(GameEngineService);
  private readonly shuffleService = inject(ShuffleService);

  readonly gameStateService = inject(GameStateService);
  readonly timer = inject(GameTimerService);
  readonly powerUpCounts = this.powerupService.counts;

  readonly level = signal<LevelData | null>(null);
  readonly isPaused = signal(false);
  readonly isGameOver = signal(false);
  readonly isOutOfLives = signal(false);
  readonly hintedBlockId = signal<string | null>(null);
  readonly blockedFeedback = signal<BlockedFeedback | null>(null);
  readonly coinsEarned = signal(0);
  readonly starsEarned = signal(0);
  readonly doubledCoins = signal(false);
  // Shared across the game-over/level-complete/out-of-lives panels — they're mutually
  // exclusive, so one flag is enough to guard against double-tapping any of their ad buttons.
  readonly isProcessingAd = signal(false);
  // Disables the panel exit buttons for the (usually instant, since interstitials preload in
  // the background) gap while a frequency-capped interstitial is checked/shown, so a slow
  // load can't be double-tapped into a double navigation.
  readonly isNavigating = signal(false);
  readonly adLoadingPowerUp = signal<PowerUpType | null>(null);

  readonly adRewardAvailable = environment.features.rewardedAdsEnabled;

  private totalLevels = 100;
  private usedHint = false;
  private powerUpsUsed = 0;
  private rewardSubmitted = false;
  private isDailyChallenge = false;
  private outOfLivesLevelId: number | null = null;
  private paramSub: Subscription | null = null;

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.coinService.init(),
      this.powerupService.init(),
      this.livesService.init(),
    ]);

    const gameConfig = await this.configService.getGameConfig();
    this.totalLevels = gameConfig.totalLevels;

    this.paramSub = this.route.paramMap.subscribe((params) => {
      const levelId = Number(params.get('levelId'));
      this.isDailyChallenge = this.route.snapshot.queryParamMap.get('mode') === 'daily';
      if (levelId > 0) {
        void this.loadLevel(levelId);
      }
    });
  }

  ngOnDestroy(): void {
    this.timer.stop();
    this.paramSub?.unsubscribe();
  }

  async loadLevel(levelId: number): Promise<void> {
    this.timer.stop();
    this.isPaused.set(false);
    this.isGameOver.set(false);
    this.isOutOfLives.set(false);
    this.hintedBlockId.set(null);
    this.blockedFeedback.set(null);
    this.coinsEarned.set(0);
    this.starsEarned.set(0);
    this.doubledCoins.set(false);
    this.usedHint = false;
    this.powerUpsUsed = 0;
    this.rewardSubmitted = false;

    await this.livesService.init();
    if (!this.livesService.hasLives()) {
      // Blocks starting (or restarting) a level outright while out of lives, rather than
      // letting any amount of gameplay run with nothing backing its eventual ad/coin payout.
      this.level.set(null);
      this.outOfLivesLevelId = levelId;
      this.isOutOfLives.set(true);
      return;
    }

    const level = await this.levelService.getLevel(levelId);
    this.level.set(level);
    this.gameStateService.startLevel(level);
    this.timer.start(level.timeLimitSeconds, () => this.onTimeExpired());
  }

  async onBlockTap(blockId: string): Promise<void> {
    if (this.isPaused() || this.isGameOver() || this.gameStateService.isComplete()) return;

    const result = this.gameStateService.move(blockId);
    if (!result) return;

    if (result.blocked) {
      this.soundService.play('blocked');
      void this.hapticsService.impact(ImpactStyle.Medium);
      this.blockedFeedback.set({ blockId, ts: Date.now() });
      if (result.state.livesRemaining <= 0) {
        this.handleGameOver();
      }
      return;
    }

    if (result.moved) {
      this.soundService.play('move');
      void this.hapticsService.impact(ImpactStyle.Light);
      this.hintedBlockId.set(null);

      if (result.state.isComplete) {
        await this.handleLevelComplete();
      } else if (!this.engine.hasAnyMove(result.state)) {
        // Defensive safety net — level generation and Shuffle both guarantee a solve
        // order exists, so this should be unreachable in practice.
        this.handleGameOver();
      }
    }
  }

  private async handleLevelComplete(): Promise<void> {
    if (this.rewardSubmitted) return;
    this.rewardSubmitted = true;

    this.timer.pause();
    this.soundService.play('levelComplete');

    const level = this.level();
    const state = this.gameStateService.state();
    if (!level || !state) return;

    const elapsed = this.timer.elapsedSeconds();
    const score = this.gameStateService.finalScore(elapsed, this.powerUpsUsed);
    const stars = await this.scoreService.calculateStars(state.moves, level.blocks.length);

    this.coinsEarned.set(LEVEL_COMPLETE_COINS);
    this.starsEarned.set(stars);

    await this.levelService.completeLevel(level.levelId, score, elapsed, stars, this.totalLevels);

    await this.rewardApi.submitGameReward({
      gameCode: environment.gameCode,
      levelId: level.levelId,
      score,
      coins: LEVEL_COMPLETE_COINS,
      idempotencyKey: crypto.randomUUID(),
    });

    await this.achievementService.evaluateAfterLevelCompletion({
      difficulty: level.difficulty,
      usedHint: this.usedHint,
      remainingSeconds: this.timer.remainingSeconds(),
      timeLimitSeconds: level.timeLimitSeconds,
      completedCount: this.levelService.completedCount(),
      hardOrAboveCompletedCount: this.levelService.completedCount(), // simple proxy until per-difficulty tracking is added
      totalLevels: this.totalLevels,
    });

    if (this.isDailyChallenge) {
      await this.dailyChallengeService.recordAttempt(true);
    }
  }

  private onTimeExpired(): void {
    this.handleGameOver();
  }

  private handleGameOver(): void {
    if (this.isGameOver()) return;
    this.timer.pause();
    this.soundService.play('failure');
    this.gameStateService.markFailed();
    this.isGameOver.set(true);
    void this.livesService.consumeLife();
    if (this.isDailyChallenge) {
      void this.dailyChallengeService.recordAttempt(false);
    }
  }

  get hasNextLevel(): boolean {
    return this.level() !== null && this.level()!.levelId < this.totalLevels;
  }

  async onNextLevel(): Promise<void> {
    const level = this.level();
    if (!level || this.isNavigating()) return;
    this.isNavigating.set(true);
    await this.adService.maybeShowInterstitialAtBreakpoint();
    void this.router.navigate(['/game-play', level.levelId + 1]);
    this.isNavigating.set(false);
  }

  async onReplay(): Promise<void> {
    const level = this.level();
    if (!level || this.isNavigating()) return;
    this.isNavigating.set(true);
    await this.adService.maybeShowInterstitialAtBreakpoint();
    await this.loadLevel(level.levelId);
    this.isNavigating.set(false);
  }

  async onLevelMap(): Promise<void> {
    if (this.isNavigating()) return;
    this.isNavigating.set(true);
    await this.adService.maybeShowInterstitialAtBreakpoint();
    void this.router.navigateByUrl('/level-map');
    this.isNavigating.set(false);
  }

  async onRetry(): Promise<void> {
    const level = this.level();
    if (!level || this.isNavigating()) return;
    this.isNavigating.set(true);
    await this.adService.maybeShowInterstitialAtBreakpoint();
    await this.loadLevel(level.levelId);
    this.isNavigating.set(false);
  }

  async onWatchAdAndContinue(): Promise<void> {
    if (this.isProcessingAd()) return;
    this.isProcessingAd.set(true);
    const result = await this.adService.showRewardedAd();
    this.isProcessingAd.set(false);

    if (result.granted) {
      const level = this.level();
      if (level) void this.loadLevel(level.levelId);
    }
  }

  /** Doubles this level's coin payout. Only ever credited from a confirmed AdMob reward
   * callback (showRewardedAd resolving granted:true) — never from the button tap itself. */
  async onWatchAdForDoubleCoins(): Promise<void> {
    if (this.doubledCoins() || this.isProcessingAd()) return;
    this.isProcessingAd.set(true);
    const result = await this.adService.showRewardedAd();
    this.isProcessingAd.set(false);

    if (result.granted) {
      const bonus = this.coinsEarned();
      await this.coinService.addCoins(bonus, 'AD_REWARD', 'level_complete_double', this.level()?.levelId);
      this.coinsEarned.set(bonus * 2);
      this.doubledCoins.set(true);
    }
  }

  /** Grants +1 life and immediately resumes the level that was blocked on 0 lives. Only
   * ever granted from a confirmed AdMob reward callback. */
  async onWatchAdForLife(): Promise<void> {
    if (this.isProcessingAd()) return;
    this.isProcessingAd.set(true);
    const result = await this.adService.showRewardedAd();
    this.isProcessingAd.set(false);

    if (result.granted) {
      await this.livesService.grantLife();
      const levelId = this.outOfLivesLevelId;
      if (levelId) void this.loadLevel(levelId);
    }
  }

  onPauseTap(): void {
    this.isPaused.set(true);
    this.timer.pause();
  }

  onHomeTap(): void {
    this.timer.pause();
    void this.router.navigateByUrl('/home');
  }

  onResume(): void {
    this.isPaused.set(false);
    this.timer.resume();
  }

  onRestartFromPause(): void {
    const level = this.level();
    if (!level) return;
    void this.loadLevel(level.levelId);
  }

  onSettingsFromPause(): void {
    void this.router.navigateByUrl('/settings');
  }

  onExitFromPause(): void {
    void this.router.navigateByUrl('/home');
  }

  async onPowerUp(type: PowerUpType): Promise<void> {
    if (this.isPaused() || this.isGameOver() || this.gameStateService.isComplete()) return;

    if (this.powerUpCounts()[type] <= 0) {
      await this.watchAdForPowerUp(type);
      return;
    }

    await this.usePowerUp(type);
  }

  /** Offered when a power-up bar button is tapped at 0 count (see PowerUpButtonComponent's
   * `offersAd`). Grants +1 use only from a confirmed AdMob reward callback, then immediately
   * spends it — the player's intent in tapping was to use it right now. */
  private async watchAdForPowerUp(type: PowerUpType): Promise<void> {
    if (!this.adRewardAvailable || this.adLoadingPowerUp()) return;
    this.adLoadingPowerUp.set(type);
    const result = await this.adService.showRewardedAd();
    this.adLoadingPowerUp.set(null);
    if (!result.granted) return;

    await this.powerupService.grant(type, 1);
    await this.usePowerUp(type);
  }

  private async usePowerUp(type: PowerUpType): Promise<void> {
    switch (type) {
      case 'HINT':
        await this.useHint();
        break;
      case 'UNDO':
        await this.useUndo();
        break;
      case 'SHUFFLE':
        await this.useShuffle();
        break;
      case 'EXTRA':
        await this.useExtraTime();
        break;
    }
  }

  private async useHint(): Promise<void> {
    const used = await this.powerupService.use('HINT');
    if (!used) return;

    const blockId = this.gameStateService.hintBlockId();
    if (!blockId) {
      await this.powerupService.grant('HINT', 1);
      return;
    }

    this.usedHint = true;
    this.powerUpsUsed++;
    this.hintedBlockId.set(blockId);
    this.soundService.play('buttonClick');
  }

  private async useUndo(): Promise<void> {
    const used = await this.powerupService.use('UNDO');
    if (!used) return;

    const undone = this.gameStateService.undo();
    if (!undone) {
      await this.powerupService.grant('UNDO', 1);
      return;
    }

    this.hintedBlockId.set(null);
    this.powerUpsUsed++;
    this.soundService.play('buttonClick');
  }

  private async useShuffle(): Promise<void> {
    const used = await this.powerupService.use('SHUFFLE');
    if (!used) return;

    const state = this.gameStateService.state();
    if (!state) {
      await this.powerupService.grant('SHUFFLE', 1);
      return;
    }

    const shuffled = this.shuffleService.shuffle(state);
    if (!shuffled) {
      await this.powerupService.grant('SHUFFLE', 1);
      return;
    }

    this.gameStateService.applyShuffledBlocks(shuffled);
    this.hintedBlockId.set(null);
    this.powerUpsUsed++;
    this.soundService.play('buttonClick');
  }

  private async useExtraTime(): Promise<void> {
    const used = await this.powerupService.use('EXTRA');
    if (!used) return;

    this.timer.addSeconds(15);
    this.powerUpsUsed++;
    this.soundService.play('buttonClick');
  }
}
