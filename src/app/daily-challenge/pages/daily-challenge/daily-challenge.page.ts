import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DailyChallengeService } from '../../../core/services/daily-challenge.service';
import { CoinService } from '../../../core/services/coin.service';
import { ConfigService, RewardConfig } from '../../../core/services/config.service';
import { AdService } from '../../../core/services/ad.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-daily-challenge',
  templateUrl: './daily-challenge.page.html',
  styleUrls: ['./daily-challenge.page.scss'],
  standalone: false,
})
export class DailyChallengePage implements OnInit {
  private readonly router = inject(Router);
  private readonly dailyChallengeService = inject(DailyChallengeService);
  private readonly coinService = inject(CoinService);
  private readonly config = inject(ConfigService);
  private readonly adService = inject(AdService);

  readonly status = this.dailyChallengeService.status;
  readonly balance = this.coinService.balance;
  reward: RewardConfig['dailyChallengeReward'] = { coins: 0, score: 0 };
  isClaiming = false;

  readonly adRewardAvailable = environment.features.rewardedAdsEnabled;
  readonly isWatchingAd = signal(false);

  async ngOnInit(): Promise<void> {
    await this.coinService.init();
    const gameConfig = await this.config.getGameConfig();
    const rewardConfig = await this.config.getRewardConfig();
    this.reward = rewardConfig.dailyChallengeReward;
    await this.dailyChallengeService.init(gameConfig.totalLevels);
  }

  onPlay(): void {
    const status = this.status();
    if (!status) return;
    void this.router.navigate(['/game-play', status.levelId], { queryParams: { mode: 'daily' } });
  }

  async onClaim(): Promise<void> {
    if (this.isClaiming) return;
    this.isClaiming = true;
    await this.dailyChallengeService.claimReward();
    this.isClaiming = false;
  }

  get attemptsRemaining(): number {
    return this.dailyChallengeService.attemptsRemaining();
  }

  async onWatchAdToDouble(): Promise<void> {
    if (this.isWatchingAd()) return; // prevent double-tap / overlapping ad requests
    this.isWatchingAd.set(true);

    try {
      const result = await this.adService.showRewardedAd();
      if (result.granted) {
        await this.dailyChallengeService.claimAdBonus();
      }
    } finally {
      this.isWatchingAd.set(false);
    }
  }
}
