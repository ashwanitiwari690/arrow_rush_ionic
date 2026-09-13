import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CoinService } from '../core/services/coin.service';
import { LevelService } from '../core/services/level.service';
import { ThemeService } from '../core/services/theme.service';
import { ConfigService } from '../core/services/config.service';
import { LivesService } from '../core/services/lives.service';
import { DailyChallengeService } from '../core/services/daily-challenge.service';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly coinService = inject(CoinService);
  private readonly levelService = inject(LevelService);
  private readonly themeService = inject(ThemeService);
  private readonly configService = inject(ConfigService);
  private readonly livesService = inject(LivesService);
  private readonly dailyChallengeService = inject(DailyChallengeService);

  readonly livesCount = this.livesService.count;
  readonly dailyStatus = this.dailyChallengeService.status;

  totalLevels = 100;
  maxLives = 3;

  // Ticks once a second so `livesRegenText` can count down live without polling the
  // service — cleaned up in ngOnDestroy so the timer never outlives this page.
  private readonly now = signal(Date.now());
  private regenTimer: ReturnType<typeof setInterval> | null = null;

  readonly nextLevelId = computed(() => {
    const progress = this.levelService.progress();
    let id = 1;
    for (let levelId = 1; levelId <= this.totalLevels; levelId++) {
      id = levelId;
      if (!progress[levelId]?.completed) break;
    }
    return id;
  });

  readonly completedCount = computed(
    () => Object.values(this.levelService.progress()).filter((p) => p.completed).length,
  );

  readonly totalStars = computed(
    () => Object.values(this.levelService.progress()).reduce((sum, p) => sum + p.stars, 0),
  );

  readonly progressPercent = computed(() =>
    this.totalLevels > 0 ? Math.min(100, Math.round((this.completedCount() / this.totalLevels) * 100)) : 0,
  );

  readonly dailyRewardReady = computed(() => {
    const status = this.dailyStatus();
    return !!status && status.completed && !status.rewardClaimed;
  });

  readonly livesRegenText = computed(() => {
    if (this.livesCount() >= this.maxLives) return null;
    const nextRegenAt = this.livesService.nextRegenAt();
    if (!nextRegenAt) return null;

    const totalSeconds = Math.max(0, Math.ceil((nextRegenAt - this.now()) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  });

  get greeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  }

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.coinService.init(),
      this.levelService.init(),
      this.themeService.init(),
      this.livesService.init(),
    ]);
    const gameConfig = await this.configService.getGameConfig();
    this.totalLevels = gameConfig.totalLevels;
    this.maxLives = gameConfig.livesPerLevel;
    await this.dailyChallengeService.init(this.totalLevels);

    this.regenTimer = setInterval(() => this.now.set(Date.now()), 1000);
  }

  ngOnDestroy(): void {
    if (this.regenTimer !== null) clearInterval(this.regenTimer);
  }

  async onPlay(): Promise<void> {
    void this.router.navigate(['/game-play', this.nextLevelId()]);
  }

  onDailyChallenge(): void {
    void this.router.navigateByUrl('/daily-challenge');
  }

  onLevels(): void {
    void this.router.navigateByUrl('/level-map');
  }

  onStore(): void {
    void this.router.navigateByUrl('/store');
  }

  onProfile(): void {
    void this.router.navigateByUrl('/profile');
  }

  onSettings(): void {
    void this.router.navigateByUrl('/settings');
  }
}
