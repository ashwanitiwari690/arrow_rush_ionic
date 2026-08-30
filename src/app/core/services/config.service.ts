import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Difficulty } from '../models/game.models';

interface RewardConfig {
  levelCompletionCoins: Record<Difficulty, number>;
  starThresholds: { threeStarMoveRatio: number; twoStarMoveRatio: number };
  dailyChallengeReward: { coins: number; score: number };
  achievementRewards: Record<string, number>;
}

interface PowerUpConfig {
  startingCounts: { HINT: number; UNDO: number; SHUFFLE: number; EXTRA: number };
  storeCosts: { HINT: number; UNDO: number; SHUFFLE: number; EXTRA: number };
  storeBundleSize: number;
}

interface ThemeDefinition {
  id: string;
  name: string;
  cost: number;
  colors: { boardBg: string; cellBg: string; cellBorder: string; accent: string };
}

interface ThemeConfig {
  themes: ThemeDefinition[];
}

interface GameConfig {
  startingCoins: number;
  livesPerLevel: number;
  livesRegenMinutes: number;
  totalLevels: number;
}

/**
 * Loads assets/config/*.json once and caches it in memory. Keeps tunable game numbers
 * (rewards, power-up costs, theme prices) out of component/service code.
 */
@Injectable({ providedIn: 'root' })
export class ConfigService {
  private readonly http = inject(HttpClient);

  private rewardConfig?: RewardConfig;
  private powerUpConfig?: PowerUpConfig;
  private themeConfig?: ThemeConfig;
  private gameConfig?: GameConfig;

  async getRewardConfig(): Promise<RewardConfig> {
    if (!this.rewardConfig) {
      this.rewardConfig = await firstValueFrom(
        this.http.get<RewardConfig>('assets/config/reward-config.json'),
      );
    }
    return this.rewardConfig;
  }

  async getPowerUpConfig(): Promise<PowerUpConfig> {
    if (!this.powerUpConfig) {
      this.powerUpConfig = await firstValueFrom(
        this.http.get<PowerUpConfig>('assets/config/powerup-config.json'),
      );
    }
    return this.powerUpConfig;
  }

  async getThemeConfig(): Promise<ThemeConfig> {
    if (!this.themeConfig) {
      this.themeConfig = await firstValueFrom(
        this.http.get<ThemeConfig>('assets/config/theme-config.json'),
      );
    }
    return this.themeConfig;
  }

  async getGameConfig(): Promise<GameConfig> {
    if (!this.gameConfig) {
      this.gameConfig = await firstValueFrom(
        this.http.get<GameConfig>('assets/config/game-config.json'),
      );
    }
    return this.gameConfig;
  }
}

export type { RewardConfig, PowerUpConfig, ThemeDefinition, ThemeConfig, GameConfig };
