import { Injectable, inject, signal } from '@angular/core';
import { PowerUpType } from '../models/game.models';
import { StorageService } from './storage.service';
import { ConfigService } from './config.service';
import { CoinService } from './coin.service';

const POWERUP_KEY = 'arrow_rush.powerup_counts';

export type PowerUpCounts = Record<PowerUpType, number>;

/** Owns power-up inventory: starting counts, store purchases, and consumption during play. */
@Injectable({ providedIn: 'root' })
export class PowerupService {
  private readonly storage = inject(StorageService);
  private readonly config = inject(ConfigService);
  private readonly coins = inject(CoinService);

  private readonly _counts = signal<PowerUpCounts>({ HINT: 0, UNDO: 0, SHUFFLE: 0, EXTRA: 0 });
  readonly counts = this._counts.asReadonly();

  private initialized = false;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const [stored, powerUpConfig] = await Promise.all([
        this.storage.get<PowerUpCounts>(POWERUP_KEY),
        this.config.getPowerUpConfig(),
      ]);

      this._counts.set(stored ?? { ...powerUpConfig.startingCounts });
      this.initialized = true;
    })();

    return this.initPromise;
  }

  has(type: PowerUpType): boolean {
    return this._counts()[type] > 0;
  }

  /** Consumes one use. Returns false if none were available. */
  async use(type: PowerUpType): Promise<boolean> {
    await this.init();
    const current = this._counts();
    if (current[type] <= 0) return false;

    const next = { ...current, [type]: current[type] - 1 };
    this._counts.set(next);
    await this.storage.set(POWERUP_KEY, next);
    return true;
  }

  async grant(type: PowerUpType, quantity: number): Promise<void> {
    await this.init();
    const next = { ...this._counts(), [type]: this._counts()[type] + quantity };
    this._counts.set(next);
    await this.storage.set(POWERUP_KEY, next);
  }

  /** Buys `quantity` of a power-up with coins, at the configured store cost. */
  async purchase(type: PowerUpType, quantity: number): Promise<boolean> {
    const powerUpConfig = await this.config.getPowerUpConfig();
    const cost = powerUpConfig.storeCosts[type] * quantity;

    const spent = await this.coins.spendCoins(cost, 'POWERUP_PURCHASE', type);
    if (!spent) return false;

    await this.grant(type, quantity);
    return true;
  }
}
