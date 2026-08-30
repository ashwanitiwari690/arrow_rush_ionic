import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { DailyChallengeService } from '../../../core/services/daily-challenge.service';
import { CoinService } from '../../../core/services/coin.service';
import { ConfigService, RewardConfig } from '../../../core/services/config.service';

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

  readonly status = this.dailyChallengeService.status;
  readonly balance = this.coinService.balance;
  reward: RewardConfig['dailyChallengeReward'] = { coins: 0, score: 0 };
  isClaiming = false;

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
}
