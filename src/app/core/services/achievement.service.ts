import { Injectable, inject, signal } from '@angular/core';
import { Achievement } from '../models/economy.models';
import { StorageService } from './storage.service';
import { ConfigService } from './config.service';
import { CoinService } from './coin.service';

const ACHIEVEMENTS_KEY = 'arrow_rush.achievements';

const DEFINITIONS: Omit<Achievement, 'isUnlocked' | 'unlockedAt'>[] = [
  { id: 'FIRST_WIN', title: 'First Victory', description: 'Complete your first level.', icon: 'trophy' },
  { id: 'LEVELS_10', title: '10 Levels', description: 'Complete 10 levels.', icon: 'trophy' },
  { id: 'LEVELS_50', title: '50 Levels', description: 'Complete 50 levels.', icon: 'trophy' },
  { id: 'LEVELS_100', title: '100 Levels', description: 'Complete all 100 levels.', icon: 'trophy' },
  { id: 'HARD_LEVELS_10', title: 'Hard Mode', description: 'Complete 10 HARD (or above) levels.', icon: 'flame' },
  { id: 'NO_HINT_CLEAR', title: 'No Help Needed', description: 'Finish a level without using a hint.', icon: 'bulb' },
  { id: 'UNDER_TIME_LIMIT', title: 'Speed Runner', description: 'Finish a level with over half the time left.', icon: 'timer' },
];

export interface LevelCompletionContext {
  difficulty: string;
  usedHint: boolean;
  remainingSeconds: number;
  timeLimitSeconds: number;
  completedCount: number;
  hardOrAboveCompletedCount: number;
  totalLevels: number;
}

/** Static achievement catalog + unlock state. Coin rewards on unlock come from
 * reward-config.json's `achievementRewards`, never a literal in this file. */
@Injectable({ providedIn: 'root' })
export class AchievementService {
  private readonly storage = inject(StorageService);
  private readonly config = inject(ConfigService);
  private readonly coins = inject(CoinService);

  private readonly _achievements = signal<Achievement[]>(
    DEFINITIONS.map((d) => ({ ...d, isUnlocked: false, unlockedAt: null })),
  );
  readonly achievements = this._achievements.asReadonly();

  private initialized = false;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const stored = await this.storage.get<Record<string, number>>(ACHIEVEMENTS_KEY);
      if (stored) {
        this._achievements.set(
          this._achievements().map((a) =>
            stored[a.id] ? { ...a, isUnlocked: true, unlockedAt: stored[a.id] } : a,
          ),
        );
      }
      this.initialized = true;
    })();

    return this.initPromise;
  }

  async evaluateAfterLevelCompletion(context: LevelCompletionContext): Promise<Achievement[]> {
    await this.init();
    const toUnlock: string[] = [];

    if (context.completedCount >= 1) toUnlock.push('FIRST_WIN');
    if (context.completedCount >= 10) toUnlock.push('LEVELS_10');
    if (context.completedCount >= 50) toUnlock.push('LEVELS_50');
    if (context.completedCount >= context.totalLevels) toUnlock.push('LEVELS_100');
    if (context.hardOrAboveCompletedCount >= 10) toUnlock.push('HARD_LEVELS_10');
    if (!context.usedHint) toUnlock.push('NO_HINT_CLEAR');
    if (context.remainingSeconds > context.timeLimitSeconds / 2) toUnlock.push('UNDER_TIME_LIMIT');

    return this.unlock(toUnlock);
  }

  private async unlock(ids: string[]): Promise<Achievement[]> {
    const rewardConfig = await this.config.getRewardConfig();
    const current = this._achievements();
    const newlyUnlocked: Achievement[] = [];
    const now = Date.now();

    const next = current.map((a) => {
      if (ids.includes(a.id) && !a.isUnlocked) {
        const unlocked = { ...a, isUnlocked: true, unlockedAt: now };
        newlyUnlocked.push(unlocked);
        return unlocked;
      }
      return a;
    });

    if (newlyUnlocked.length === 0) return [];

    this._achievements.set(next);
    const stored: Record<string, number> = {};
    for (const a of next) if (a.isUnlocked && a.unlockedAt) stored[a.id] = a.unlockedAt;
    await this.storage.set(ACHIEVEMENTS_KEY, stored);

    for (const a of newlyUnlocked) {
      const reward = rewardConfig.achievementRewards[a.id] ?? 0;
      if (reward > 0) {
        await this.coins.addCoins(reward, 'ACHIEVEMENT', a.id);
      }
    }

    return newlyUnlocked;
  }
}
