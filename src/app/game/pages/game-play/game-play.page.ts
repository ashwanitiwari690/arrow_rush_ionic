import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, combineLatest, distinctUntilChanged, map } from 'rxjs';
import { ImpactStyle } from '@capacitor/haptics';
import { AlertController } from '@ionic/angular/alert-controller';
import { ToastController } from '@ionic/angular/toast-controller';

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
import { AudioService } from '../../../core/services/audio.service';
import { MusicService } from '../../../core/services/music.service';
import { HapticsService } from '../../../core/services/haptics.service';
import { AdService, RewardedAdResult } from '../../../core/services/ad.service';
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
  providers: [GameTimerService, GameStateService],
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
  private readonly audio = inject(AudioService);
  private readonly music = inject(MusicService);
  private readonly hapticsService = inject(HapticsService);
  private readonly adService = inject(AdService);
  private readonly rewardApi = inject(GameRewardApiService);
  private readonly engine = inject(GameEngineService);
  private readonly shuffleService = inject(ShuffleService);
  private readonly toastController = inject(ToastController);
  private readonly alertController = inject(AlertController);

  readonly gameStateService = inject(GameStateService);
  readonly timer = inject(GameTimerService);
  readonly powerUpCounts = this.powerupService.counts;

  readonly level = signal<LevelData | null>(null);
  readonly isLoading = signal(true);
  readonly loadError = signal(false);
  readonly sessionId = signal(0);
  readonly isUsingPowerUp = signal(false);
  readonly isCompleting = signal(false);
  readonly roundBreakPending = signal(false);
  readonly finalScore = signal(0);
  readonly feedbackText = signal('Tap an arrow with a clear path to the edge.');
  private readonly pageActive = signal(true);
  readonly isPaused = signal(false);
  readonly isGameOver = signal(false);
  readonly isOutOfLives = signal(false);
  readonly hintedBlockId = signal<string | null>(null);
  readonly blockedFeedback = signal<BlockedFeedback | null>(null);
  readonly coinsEarned = signal(0);
  readonly starsEarned = signal(0);
  readonly hintRewardClaimed = signal(false);
  // Shared across the game-over/level-complete/out-of-lives panels — they're mutually
  // exclusive, so one flag is enough to guard against double-tapping any of their ad buttons.
  readonly isProcessingAd = signal(false);
  // Disables the panel exit buttons for the (usually instant, since interstitials preload in
  // the background) gap while a frequency-capped interstitial is checked/shown, so a slow
  // load can't be double-tapped into a double navigation.
  readonly isNavigating = signal(false);
  readonly adLoadingPowerUp = signal<PowerUpType | null>(null);

  readonly adRewardAvailable = environment.features.adsEnabled && environment.features.rewardedAdsEnabled;

  private totalLevels = 100;
  private usedHint = false;
  private powerUpsUsed = 0;
  private rewardSubmitted = false;
  isDailyChallenge = false;
  private outOfLivesLevelId: number | null = null;
  private paramSub: Subscription | null = null;
  private loadRequest = 0;
  private requestedLevelId: number | null = null;
  private destroyed = false;
  private roundId = '';

  constructor() {
    effect(() => {
      if (!this.audio.appActive() && this.pageActive() && this.level() && !this.gameStateService.isComplete() && !this.isGameOver()) {
        this.onPauseTap();
      }
    });
    effect(() => {
      if (!this.pageActive() || !this.level() || this.isLoading()) return;
      if (this.isPaused() || this.isGameOver() || this.gameStateService.isComplete() || this.adLoadingPowerUp()) this.music.pause();
      else this.music.start(this.isDailyChallenge ? 'daily' : 'gameplay');
    });
    effect(() => {
      const remaining = this.timer.remainingSeconds();
      if (this.pageActive() && this.timer.isRunning() && remaining > 0 && remaining <= 5) this.soundService.play('countdown');
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      await Promise.all([
        this.coinService.init(),
        this.powerupService.init(),
        this.livesService.init(),
      ]);

      const gameConfig = await this.configService.getGameConfig();
      this.totalLevels = gameConfig.totalLevels;
      await this.dailyChallengeService.init(this.totalLevels);

      if (this.destroyed) return;
      this.paramSub?.unsubscribe();
      this.paramSub = combineLatest([this.route.paramMap, this.route.queryParamMap]).pipe(
        map(([params, query]) => ({ levelId: Number(params.get('levelId')), daily: query.get('mode') === 'daily' })),
        distinctUntilChanged((previous, current) => previous.levelId === current.levelId && previous.daily === current.daily),
      ).subscribe(({ levelId, daily }) => {
        this.isDailyChallenge = daily;
        if (Number.isInteger(levelId) && levelId > 0 && levelId <= this.totalLevels) {
          void this.loadLevel(levelId);
        } else {
          this.isLoading.set(false);
          this.loadError.set(true);
        }
      });
    } catch {
      this.isLoading.set(false);
      this.loadError.set(true);
    }
  }

  ionViewWillEnter(): void {
    this.pageActive.set(true);
    if (!this.level() && this.requestedLevelId && !this.isLoading()) void this.loadLevel(this.requestedLevelId);
  }

  ionViewWillLeave(): void {
    this.pageActive.set(false);
    ++this.loadRequest;
    this.isLoading.set(false);
    this.timer.pause();
    this.music.pause();
    if (this.level() && !this.gameStateService.isComplete() && !this.isGameOver()) this.isPaused.set(true);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    ++this.loadRequest;
    this.timer.stop();
    this.paramSub?.unsubscribe();
  }

  async loadLevel(levelId: number): Promise<void> {
    const request = ++this.loadRequest;
    this.requestedLevelId = levelId;
    this.timer.stop();
    this.music.pause();
    this.isLoading.set(true);
    this.loadError.set(false);
    this.level.set(null);
    this.gameStateService.clear();
    this.isPaused.set(false);
    this.isGameOver.set(false);
    this.isOutOfLives.set(false);
    this.hintedBlockId.set(null);
    this.blockedFeedback.set(null);
    this.coinsEarned.set(0);
    this.finalScore.set(0);
    this.starsEarned.set(0);
    this.hintRewardClaimed.set(false);
    this.roundBreakPending.set(false);
    this.usedHint = false;
    this.powerUpsUsed = 0;
    this.rewardSubmitted = false;
    this.feedbackText.set('Tap an arrow with a clear path to the edge.');

    try {
      await this.livesService.init();
      if (request !== this.loadRequest || !this.pageActive()) return;
      if (this.isDailyChallenge) {
        const status = this.dailyChallengeService.status();
        if (status?.completed || this.dailyChallengeService.attemptsRemaining() <= 0) {
          void this.router.navigateByUrl('/daily-challenge');
          return;
        }
      }
      if (!this.livesService.hasLives()) {
        // Blocks starting (or restarting) a level outright while out of lives, rather than
        // letting any amount of gameplay run with nothing backing its eventual ad/coin payout.
        this.level.set(null);
        this.outOfLivesLevelId = levelId;
        this.isOutOfLives.set(true);
        return;
      }

      const level = await this.levelService.getLevel(levelId);
      if (request !== this.loadRequest || !this.pageActive()) return;
      this.sessionId.update((id) => id + 1);
      this.roundId = crypto.randomUUID();
      this.level.set(level);
      this.gameStateService.startLevel(level);
      this.timer.start(level.timeLimitSeconds, () => this.onTimeExpired());
      if (!this.audio.appActive()) this.onPauseTap();
      // Warm only the next board; a failed prefetch must not interrupt this game.
      if (!this.isDailyChallenge && levelId < this.totalLevels) void this.levelService.getLevel(levelId + 1).catch(() => undefined);
    } catch {
      if (request === this.loadRequest) this.loadError.set(true);
    } finally {
      if (request === this.loadRequest) this.isLoading.set(false);
    }
  }

  onRetryLoad(): void {
    if (this.requestedLevelId) void this.loadLevel(this.requestedLevelId);
    else void this.ngOnInit();
  }

  async onBlockTap(blockId: string): Promise<void> {
    if (!this.pageActive() || this.isLoading() || this.isUsingPowerUp() || this.adLoadingPowerUp() || this.isPaused() || this.isGameOver() || this.gameStateService.isComplete()) return;

    const result = this.gameStateService.move(blockId);
    if (!result) return;

    if (result.blocked) {
      this.soundService.play('blocked');
      void this.hapticsService.impact(ImpactStyle.Medium);
      this.blockedFeedback.set({ blockId, ts: Date.now() });
      this.feedbackText.set('Path blocked. Clear the arrows in front first.');
      if (result.state.livesRemaining <= 0) {
        this.handleGameOver();
      }
      return;
    }

    if (result.moved) {
      this.soundService.play('move');
      void this.hapticsService.impact(ImpactStyle.Light);
      this.hintedBlockId.set(null);
      this.feedbackText.set(result.state.blocks.length === 1 ? 'One arrow left. You can do this!' : 'Nice! Keep clearing a path to the edge.');

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
    this.isCompleting.set(true);
    this.roundBreakPending.set(true);
    const roundId = this.roundId;

    this.timer.pause();
    this.music.pause();
    this.soundService.play('levelComplete');

    try {
      const level = this.level();
      const state = this.gameStateService.state();
      if (!level || !state) return;

      const elapsed = this.timer.elapsedSeconds();
      const score = this.gameStateService.finalScore(elapsed, this.powerUpsUsed);
      this.finalScore.set(score);
      const stars = await this.scoreService.calculateStars(state.moves, level.blocks.length);

      this.coinsEarned.set(LEVEL_COMPLETE_COINS);
      this.starsEarned.set(stars);

      if (this.isDailyChallenge) {
        await this.dailyChallengeService.recordAttempt(true);
      } else {
        await this.levelService.completeLevel(level.levelId, score, elapsed, stars, this.totalLevels);
      }

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
    } catch {
      const toast = await this.toastController.create({ message: 'Puzzle complete. There was a problem saving your reward. Please check your connection.', duration: 4000, color: 'warning' });
      await toast.present();
    } finally {
      await this.finishRoundBreak(roundId);
      this.isCompleting.set(false);
    }
  }

  private onTimeExpired(): void {
    this.handleGameOver();
  }

  private handleGameOver(): void {
    if (this.isGameOver()) return;
    this.timer.pause();
    this.music.pause();
    this.soundService.play('failure');
    this.gameStateService.markFailed();
    this.isGameOver.set(true);
    this.roundBreakPending.set(true);
    const roundId = this.roundId;
    void (async () => {
      try {
        await this.livesService.consumeLife();
        if (this.isDailyChallenge) await this.dailyChallengeService.recordAttempt(false);
      } finally { await this.finishRoundBreak(roundId); }
    })().catch(() => this.roundBreakPending.set(false));
  }

  private async finishRoundBreak(roundId: string): Promise<void> {
    try {
      await this.adService.maybeShowInterstitialAtBreakpoint({
        roundId,
        canShow: () => this.pageActive() && !this.destroyed && this.roundId === roundId && this.audio.appActive(),
      });
    } catch {
      // A failed ad must never prevent the player from reaching their result screen.
    } finally {
      if (this.roundId === roundId) this.roundBreakPending.set(false);
    }
  }

  get hasNextLevel(): boolean {
    return !this.isDailyChallenge && this.level() !== null && this.level()!.levelId < this.totalLevels;
  }

  async onNextLevel(): Promise<void> {
    if (this.isDailyChallenge) {
      await this.onDailyComplete();
      return;
    }
    const level = this.level();
    if (!level || this.isNavigating()) return;
    this.isNavigating.set(true);
    void this.router.navigate(['/game-play', level.levelId + 1]);
    this.isNavigating.set(false);
  }

  async onDailyComplete(): Promise<void> {
    if (this.isNavigating()) return;
    this.isNavigating.set(true);
    void this.router.navigateByUrl('/daily-challenge');
    this.isNavigating.set(false);
  }

  async onReplay(): Promise<void> {
    if (this.isDailyChallenge) {
      await this.onDailyComplete();
      return;
    }
    const level = this.level();
    if (!level || this.isNavigating()) return;
    this.isNavigating.set(true);
    await this.loadLevel(level.levelId);
    this.isNavigating.set(false);
  }

  async onLevelMap(): Promise<void> {
    if (this.isNavigating()) return;
    this.isNavigating.set(true);
    if (this.isDailyChallenge) {
      void this.router.navigateByUrl('/daily-challenge');
    } else {
      void this.router.navigateByUrl('/level-map');
    }
    this.isNavigating.set(false);
  }

  async onRetry(): Promise<void> {
    const level = this.level();
    if (!level || this.isNavigating()) return;
    this.isNavigating.set(true);
    await this.loadLevel(level.levelId);
    this.isNavigating.set(false);
  }

  async onWatchAdAndContinue(): Promise<void> {
    if (this.isProcessingAd() || this.isDailyChallenge) return;
    this.isProcessingAd.set(true);
    try {
      const result = await this.adService.showRewardedAd(() => this.pageActive() && this.isGameOver());
      if (result.granted) {
        await this.livesService.grantLife();
        const level = this.level();
        if (level && this.pageActive()) await this.loadLevel(level.levelId);
      } else await this.showAdMessage(result);
    } finally { this.isProcessingAd.set(false); }
  }

  /** Rewarded ads grant game-only items, never coins that can be redeemed for money. */
  async onWatchAdForHint(): Promise<void> {
    if (this.hintRewardClaimed() || this.isProcessingAd()) return;
    this.isProcessingAd.set(true);
    try {
      const result = await this.adService.showRewardedAd(() => this.pageActive() && this.gameStateService.isComplete());
      if (result.granted) {
        await this.powerupService.grant('HINT', 1);
        this.hintRewardClaimed.set(true);
        this.soundService.play('reward');
      } else await this.showAdMessage(result);
    } finally { this.isProcessingAd.set(false); }
  }

  /** Grants +1 life and immediately resumes the level that was blocked on 0 lives. Only
   * ever granted from a confirmed AdMob reward callback. */
  async onWatchAdForLife(): Promise<void> {
    if (this.isProcessingAd()) return;
    this.isProcessingAd.set(true);
    try {
      const result = await this.adService.showRewardedAd(() => this.pageActive() && this.isOutOfLives());
      if (result.granted) {
        await this.livesService.grantLife();
        const levelId = this.outOfLivesLevelId;
        if (levelId && this.pageActive()) await this.loadLevel(levelId);
      } else await this.showAdMessage(result);
    } finally { this.isProcessingAd.set(false); }
  }

  private async showAdMessage(result: RewardedAdResult): Promise<void> {
    if (!this.pageActive()) return;
    const toast = await this.toastController.create({ message: result.reason ?? 'An ad is not available right now.', duration: 2500, position: 'top' });
    await toast.present();
  }

  onPauseTap(): void {
    if (this.gameStateService.isComplete() || this.isGameOver()) return;
    this.isPaused.set(true);
    this.timer.pause();
    this.music.pause();
  }

  onHomeTap(): void {
    this.timer.pause();
    if (this.isDailyChallenge) {
      void this.router.navigateByUrl('/daily-challenge');
    } else {
      void this.router.navigateByUrl('/home');
    }
  }

  onResume(): void {
    if (!this.pageActive() || !this.audio.appActive()) return;
    this.isPaused.set(false);
    this.timer.resume();
    this.music.start(this.isDailyChallenge ? 'daily' : 'gameplay');
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
    if (this.isDailyChallenge) {
      void this.router.navigateByUrl('/daily-challenge');
    } else {
      void this.router.navigateByUrl('/home');
    }
  }

  async onPowerUp(type: PowerUpType): Promise<void> {
    if (!this.pageActive() || this.isLoading() || this.isUsingPowerUp() || this.adLoadingPowerUp() || this.isPaused() || this.isGameOver() || this.gameStateService.isComplete()) return;

    this.isUsingPowerUp.set(true);
    try {
      if (this.powerUpCounts()[type] <= 0) {
        await this.watchAdForPowerUp(type);
        return;
      }

      await this.usePowerUp(type);
    } finally {
      this.isUsingPowerUp.set(false);
    }
  }

  /** Grants one use after a confirmed ad reward. The player can then tap to use it. */
  private async watchAdForPowerUp(type: PowerUpType): Promise<void> {
    if (!this.adRewardAvailable || this.adLoadingPowerUp()) return;
    this.timer.pause();
    this.adLoadingPowerUp.set(type);

    const labels: Record<PowerUpType, string> = {
      HINT: 'Hint', UNDO: 'Undo', SHUFFLE: 'Shuffle', EXTRA: 'Extra Time',
    };

    let result: RewardedAdResult;
    try {
      const alert = await this.alertController.create({
        header: `Get +1 ${labels[type]}`,
        message: `Watch an optional ad to receive one ${labels[type]} power-up for use in this game.`,
        buttons: [{ text: 'Not now', role: 'cancel' }, { text: 'Watch ad', role: 'confirm' }],
      });
      await alert.present();
      const { role } = await alert.onDidDismiss();
      if (role !== 'confirm' || !this.pageActive()) return;
      result = await this.adService.showRewardedAd(() => this.pageActive() && !this.isPaused() && !this.isGameOver() && !this.gameStateService.isComplete());
    } finally {
      this.adLoadingPowerUp.set(null);
      if (this.pageActive() && !this.isPaused() && !this.isGameOver()) this.timer.resume();
    }

    if (!result.granted) {
      const toast = await this.toastController.create({
        message: result.reason ?? 'Ad closed before finishing. No reward added.',
        duration: 2200,
        position: 'top',
        color: 'warning',
      });
      await toast.present();
      return;
    }

    await this.powerupService.grant(type, 1);
    this.soundService.play('reward');
    void this.hapticsService.impact(ImpactStyle.Medium);

    const toast = await this.toastController.create({
      message: `+1 ${labels[type]} added!`,
      duration: 2000,
      position: 'top',
      color: 'success',
    });
    await toast.present();
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

  private async consumePowerUp(type: PowerUpType): Promise<boolean> {
    const session = this.sessionId();
    const used = await this.powerupService.use(type);
    if (used && (!this.pageActive() || this.isPaused() || this.isGameOver() || session !== this.sessionId())) {
      await this.powerupService.grant(type, 1);
      return false;
    }
    return used;
  }

  private async useHint(): Promise<void> {
    const used = await this.consumePowerUp('HINT');
    if (!used) return;

    const blockId = this.gameStateService.hintBlockId();
    if (!blockId) {
      await this.powerupService.grant('HINT', 1);
      return;
    }

    this.usedHint = true;
    this.powerUpsUsed++;
    this.hintedBlockId.set(blockId);
    this.feedbackText.set('The highlighted arrow has a clear path.');
    this.soundService.play('hint');
  }

  private async useUndo(): Promise<void> {
    const used = await this.consumePowerUp('UNDO');
    if (!used) return;

    const undone = this.gameStateService.undo();
    if (!undone) {
      await this.powerupService.grant('UNDO', 1);
      return;
    }

    this.hintedBlockId.set(null);
    this.powerUpsUsed++;
    this.feedbackText.set('Last move restored. Try a different arrow.');
    this.soundService.play('undo');
  }

  private async useShuffle(): Promise<void> {
    const used = await this.consumePowerUp('SHUFFLE');
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
    this.feedbackText.set('Fresh layout. Every arrow can still escape.');
    this.soundService.play('shuffle');
  }

  private async useExtraTime(): Promise<void> {
    const used = await this.consumePowerUp('EXTRA');
    if (!used) return;

    this.timer.addSeconds(15);
    this.powerUpsUsed++;
    this.feedbackText.set('15 seconds added. Take a breath and keep going.');
    this.soundService.play('extraTime');
  }
}
