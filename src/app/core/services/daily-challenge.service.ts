import { Injectable, inject, signal } from '@angular/core';
import { DailyChallengeStatus } from '../models/economy.models';
import { StorageService } from './storage.service';
import { ConfigService } from './config.service';
import { CoinService } from './coin.service';

const DAILY_KEY = 'arrow_rush.daily_challenge';
const MAX_ATTEMPTS = 3;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function dayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/** Picks a deterministic level per calendar day and tracks that day's attempt/reward
 * state, resetting automatically the first time it's read on a new date. */
@Injectable({ providedIn: 'root' })
export class DailyChallengeService {
  private readonly storage = inject(StorageService);
  private readonly config = inject(ConfigService);
  private readonly coins = inject(CoinService);

  private readonly _status = signal<DailyChallengeStatus | null>(null);
  readonly status = this._status.asReadonly();

  async init(totalLevels: number): Promise<DailyChallengeStatus> {
    const today = todayKey();
    const stored = await this.storage.get<DailyChallengeStatus>(DAILY_KEY);

    if (stored && stored.date === today) {
      this._status.set(stored);
      return stored;
    }

    const levelId = (dayOfYear() % totalLevels) + 1;
    const fresh: DailyChallengeStatus = {
      date: today,
      levelId,
      attemptsUsed: 0,
      maxAttempts: MAX_ATTEMPTS,
      completed: false,
      rewardClaimed: false,
    };

    this._status.set(fresh);
    await this.storage.set(DAILY_KEY, fresh);
    return fresh;
  }

  async recordAttempt(won: boolean): Promise<void> {
    const status = this._status();
    if (!status) return;

    const next: DailyChallengeStatus = {
      ...status,
      attemptsUsed: status.attemptsUsed + 1,
      completed: status.completed || won,
    };

    this._status.set(next);
    await this.storage.set(DAILY_KEY, next);
  }

  async claimReward(): Promise<boolean> {
    const status = this._status();
    if (!status || !status.completed || status.rewardClaimed) return false;

    const rewardConfig = await this.config.getRewardConfig();
    await this.coins.addCoins(rewardConfig.dailyChallengeReward.coins, 'DAILY_CHALLENGE', 'daily_challenge');

    const next: DailyChallengeStatus = { ...status, rewardClaimed: true };
    this._status.set(next);
    await this.storage.set(DAILY_KEY, next);
    return true;
  }

  attemptsRemaining(): number {
    const status = this._status();
    if (!status) return 0;
    return Math.max(0, status.maxAttempts - status.attemptsUsed);
  }
}
