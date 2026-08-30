import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CoinService } from '../core/services/coin.service';
import { LevelService } from '../core/services/level.service';
import { ThemeService } from '../core/services/theme.service';
import { ConfigService } from '../core/services/config.service';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage implements OnInit {
  private readonly router = inject(Router);
  private readonly coinService = inject(CoinService);
  private readonly levelService = inject(LevelService);
  private readonly themeService = inject(ThemeService);
  private readonly configService = inject(ConfigService);

  private totalLevels = 100;

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.coinService.init(),
      this.levelService.init(),
      this.themeService.init(),
    ]);
    const gameConfig = await this.configService.getGameConfig();
    this.totalLevels = gameConfig.totalLevels;
  }

  async onPlay(): Promise<void> {
    const progress = this.levelService.progress();
    let nextLevelId = 1;
    for (let id = 1; id <= this.totalLevels; id++) {
      if (!progress[id]?.completed) {
        nextLevelId = id;
        break;
      }
      nextLevelId = id;
    }
    void this.router.navigate(['/game-play', nextLevelId]);
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
