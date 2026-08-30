import { Injectable, inject, signal } from '@angular/core';
import { CoinTransaction, CoinTransactionType } from '../models/economy.models';
import { StorageService } from './storage.service';
import { ConfigService } from './config.service';

const COIN_BALANCE_KEY = 'arrow_rush.coin_balance';
const COIN_HISTORY_KEY = 'arrow_rush.coin_history';
// Kept short deliberately — nothing in the UI currently browses deep transaction history,
// so there's no reason to grow on-device storage indefinitely for entries no one reads.
const MAX_HISTORY_ENTRIES = 50;

/**
 * The only place coin balance is mutated. Local-only today, but every change is
 * recorded as a CoinTransaction so a future centralized wallet backend can reconcile
 * (and eventually replace) this as the source of truth without a schema change.
 *
 * IMPORTANT: this is gameplay coin state, not a wallet. Nothing in this file pays out
 * real money or computes a rupee amount — see GameRewardApiService for that seam.
 */
@Injectable({ providedIn: 'root' })
export class CoinService {
  private readonly storage = inject(StorageService);
  private readonly config = inject(ConfigService);

  private readonly _balance = signal(0);
  readonly balance = this._balance.asReadonly();

  private history: CoinTransaction[] = [];
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const [storedBalance, storedHistory, gameConfig] = await Promise.all([
        this.storage.get<number>(COIN_BALANCE_KEY),
        this.storage.get<CoinTransaction[]>(COIN_HISTORY_KEY),
        this.config.getGameConfig(),
      ]);

      this._balance.set(storedBalance ?? gameConfig.startingCoins);
      this.history = storedHistory ?? [];
      this.initialized = true;
    })();

    return this.initPromise;
  }

  async addCoins(amount: number, type: CoinTransactionType, source: string, levelId?: number): Promise<void> {
    if (amount <= 0) return;
    await this.init();

    this._balance.set(this._balance() + amount);
    await this.recordTransaction({ type, amount, source, levelId, status: 'CONFIRMED' });
    await this.persistBalance();
  }

  /** Returns false (and changes nothing) if the balance is insufficient. */
  async spendCoins(amount: number, type: CoinTransactionType, source: string): Promise<boolean> {
    await this.init();
    if (this._balance() < amount) return false;

    this._balance.set(this._balance() - amount);
    await this.recordTransaction({ type, amount: -amount, source, status: 'CONFIRMED' });
    await this.persistBalance();
    return true;
  }

  /** Deducts coins after a confirmed redemption. Takes the backend's own `coinsRedeemed`
   * figure rather than a locally-tracked guess, and clamps it to the current balance —
   * the backend is authoritative for how much was actually redeemed, this just mirrors
   * that number locally so the UI reflects it without ever risking a negative balance. */
  async confirmRedemption(coinsRedeemed: number): Promise<void> {
    await this.init();
    const safeAmount = Math.max(0, Math.min(this._balance(), Math.floor(coinsRedeemed) || 0));
    if (safeAmount <= 0) return;

    this._balance.set(this._balance() - safeAmount);
    await this.recordTransaction({ type: 'REDEMPTION', amount: -safeAmount, source: 'redeem', status: 'CONFIRMED' });
    await this.persistBalance();
  }

  async getTransactionHistory(): Promise<CoinTransaction[]> {
    await this.init();
    return [...this.history].reverse();
  }

  private async recordTransaction(
    partial: Omit<CoinTransaction, 'id' | 'timestamp'>,
  ): Promise<void> {
    const transaction: CoinTransaction = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      ...partial,
    };
    this.history = [...this.history, transaction].slice(-MAX_HISTORY_ENTRIES);
    await this.storage.set(COIN_HISTORY_KEY, this.history);
  }

  private async persistBalance(): Promise<void> {
    await this.storage.set(COIN_BALANCE_KEY, this._balance());
  }
}
