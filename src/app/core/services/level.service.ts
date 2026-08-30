import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LevelData, LevelSummary } from '../models/game.models';
import { LevelProgress } from '../models/economy.models';
import { StorageService } from './storage.service';

const PROGRESS_KEY = 'arrow_rush.level_progress';

/**
 * Loads level data from assets/levels/*.json (never hardcoded in components) and owns
 * per-level progression: unlocked, completed, stars, best score/time.
 */
@Injectable({ providedIn: 'root' })
export class LevelService {
  private readonly http = inject(HttpClient);
  private readonly storage = inject(StorageService);

  private readonly _progress = signal<Record<number, LevelProgress>>({});
  readonly progress = this._progress.asReadonly();

  private index: LevelSummary[] | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const stored = await this.storage.get<Record<number, LevelProgress>>(PROGRESS_KEY);
      const progress = stored ?? {};
      if (!progress[1]) {
        progress[1] = { levelId: 1, completed: false, unlocked: true, stars: 0, bestScore: 0, bestTimeSeconds: null };
      }
      this._progress.set(progress);
      this.initialized = true;
    })();

    return this.initPromise;
  }

  async getLevelIndex(): Promise<LevelSummary[]> {
    if (!this.index) {
      this.index = await firstValueFrom(
        this.http.get<LevelSummary[]>('assets/levels/levels-index.json'),
      );
    }
    return this.index;
  }

  async getLevel(levelId: number): Promise<LevelData> {
    const fileName = `level-${String(levelId).padStart(3, '0')}.json`;
    return firstValueFrom(this.http.get<LevelData>(`assets/levels/${fileName}`));
  }

  async getProgress(levelId: number): Promise<LevelProgress> {
    await this.init();
    return (
      this._progress()[levelId] ?? {
        levelId,
        completed: false,
        unlocked: false,
        stars: 0,
        bestScore: 0,
        bestTimeSeconds: null,
      }
    );
  }

  isUnlocked(levelId: number): boolean {
    return this._progress()[levelId]?.unlocked ?? levelId === 1;
  }

  async completeLevel(
    levelId: number,
    score: number,
    timeSeconds: number,
    stars: number,
    totalLevels: number,
  ): Promise<void> {
    await this.init();
    const current = await this.getProgress(levelId);

    const updated: LevelProgress = {
      ...current,
      completed: true,
      unlocked: true,
      stars: Math.max(current.stars, stars),
      bestScore: Math.max(current.bestScore, score),
      bestTimeSeconds:
        current.bestTimeSeconds === null ? timeSeconds : Math.min(current.bestTimeSeconds, timeSeconds),
    };

    const next = { ...this._progress(), [levelId]: updated };

    const nextLevelId = levelId + 1;
    if (nextLevelId <= totalLevels && !next[nextLevelId]?.unlocked) {
      next[nextLevelId] = {
        ...(next[nextLevelId] ?? {
          levelId: nextLevelId,
          completed: false,
          stars: 0,
          bestScore: 0,
          bestTimeSeconds: null,
        }),
        unlocked: true,
      };
    }

    this._progress.set(next);
    await this.storage.set(PROGRESS_KEY, next);
  }

  completedCount(): number {
    return Object.values(this._progress()).filter((p) => p.completed).length;
  }
}
