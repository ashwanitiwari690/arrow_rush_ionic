import { Injectable, inject, signal } from '@angular/core';
import { StorageService } from './storage.service';
import { ConfigService } from './config.service';

const LIVES_KEY = 'arrow_rush.lives';

interface LivesRecord {
  count: number;
  lastRegenAt: number;
}

/** Global life pool (Candy-Crush style): a failed level attempt costs one life; lives
 * regenerate on a timer. Kept separate from the on-screen hearts shown during a single
 * attempt, which are just that level's own `livesRemaining` in GameState. Future-ready
 * for server sync — everything routes through this one service. */
@Injectable({ providedIn: 'root' })
export class LivesService {
  private readonly storage = inject(StorageService);
  private readonly config = inject(ConfigService);

  private readonly _count = signal(3);
  private readonly _nextRegenAt = signal<number | null>(null);
  readonly count = this._count.asReadonly();
  readonly nextRegenAt = this._nextRegenAt.asReadonly();

  private maxLives = 3;
  private regenMs = 10 * 60 * 1000;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const gameConfig = await this.config.getGameConfig();
      this.maxLives = gameConfig.livesPerLevel;
      this.regenMs = gameConfig.livesRegenMinutes * 60 * 1000;

      const stored = await this.storage.get<LivesRecord>(LIVES_KEY);
      const record = stored ?? { count: this.maxLives, lastRegenAt: Date.now() };

      this.applyRegen(record);
      this.initialized = true;
    })();

    return this.initPromise;
  }

  hasLives(): boolean {
    return this._count() > 0;
  }

  async consumeLife(): Promise<void> {
    await this.init();
    if (this._count() <= 0) return;

    const nextCount = this._count() - 1;
    this._count.set(nextCount);
    const record: LivesRecord = { count: nextCount, lastRegenAt: Date.now() };
    this._nextRegenAt.set(nextCount < this.maxLives ? record.lastRegenAt + this.regenMs : null);
    await this.storage.set(LIVES_KEY, record);
  }

  private applyRegen(record: LivesRecord): void {
    let { count, lastRegenAt } = record;

    if (count < this.maxLives) {
      const elapsed = Date.now() - lastRegenAt;
      const regenerated = Math.floor(elapsed / this.regenMs);
      if (regenerated > 0) {
        count = Math.min(this.maxLives, count + regenerated);
        lastRegenAt = count >= this.maxLives ? Date.now() : lastRegenAt + regenerated * this.regenMs;
      }
    }

    this._count.set(count);
    this._nextRegenAt.set(count < this.maxLives ? lastRegenAt + this.regenMs : null);
  }
}
