import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Difficulty } from '../models/game.models';

interface RewardConfig {
  levelCompletionCoins: Record<Difficulty, number>;
  starThresholds: { threeStarMoveRatio: number; twoStarMoveRatio: number };
  dailyChallengeReward: { coins: number; score: number };
  achievementRewards: Record<string, number>;
  /** Coins granted for a single confirmed rewarded-ad watch (e.g. Store "Watch Ad for Coins",
   * or doubling a reward elsewhere). Config-driven so it's never hardcoded next to ad logic. */
  watchAdRewardCoins: number;
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

  private readonly requests = new Map<string, Promise<unknown>>();

  async getRewardConfig(): Promise<RewardConfig> {
    return this.load<RewardConfig>('reward-config.json');
  }

  async getPowerUpConfig(): Promise<PowerUpConfig> {
    return this.load<PowerUpConfig>('powerup-config.json');
  }

  async getThemeConfig(): Promise<ThemeConfig> {
    return this.load<ThemeConfig>('theme-config.json');
  }

  async getGameConfig(): Promise<GameConfig> {
    return this.load<GameConfig>('game-config.json');
  }

  private async load<T>(file: string): Promise<T> {
    let request = this.requests.get(file) as Promise<T> | undefined;
    if (!request) {
      request = firstValueFrom(this.http.get<T>(`assets/config/${file}`));
      this.requests.set(file, request);
    }
    try {
      return await request;
    } catch (error) {
      if (this.requests.get(file) === request) this.requests.delete(file);
      throw error;
    }
  }
}

export type { RewardConfig, PowerUpConfig, ThemeDefinition, ThemeConfig, GameConfig };
