import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { GameRewardApiService, GameRewardResult } from './game-reward-api.service';
import {
  GameRewardSubmission,
  RedeemApiErrorEnvelope,
  RedeemRequest,
  RedeemResponse,
} from '../models/economy.models';
import { CoinService } from './coin.service';
import { StorageService } from './storage.service';
import { environment } from '../../../environments/environment';

const PROCESSED_KEYS_KEY = 'arrow_rush.processed_reward_keys';
// Idempotency keys only need to survive long enough to catch a retried callback right
// after submission, not to log an indefinite history — kept short to keep device storage
// small, matching CoinService's transaction history cap for the same reason.
const MAX_TRACKED_KEYS = 40;

interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
}

export class RedeemApiError extends Error {
  constructor(
    message: string,
    readonly errorCode: string,
  ) {
    super(message);
  }
}

/**
 * `submitGameReward` stays a local, offline-only stand-in — level-completion coins are
 * still credited through CoinService directly, with an idempotencyKey guard, since that
 * part of the reward flow doesn't touch a backend.
 *
 * `redeemCoins` is the one real integration point: it calls the same centralized Game
 * Reward API other games in this family (e.g. Brain Rush) call, at
 * `POST {environment.apiBaseUrl}/redeem`, with the identical request/response contract —
 * no auth header, a `{ success, data }` / `{ success: false, error }` envelope, and the
 * backend as the sole source of truth for `coinsRedeemed` and `amountCredited`.
 */
@Injectable({ providedIn: 'root' })
export class LocalGameRewardApiService extends GameRewardApiService {
  private readonly coins = inject(CoinService);
  private readonly storage = inject(StorageService);
  private readonly http = inject(HttpClient);

  private processedKeys = new Set<string>();
  private loaded = false;

  async submitGameReward(payload: GameRewardSubmission): Promise<GameRewardResult> {
    await this.ensureLoaded();

    if (this.processedKeys.has(payload.idempotencyKey)) {
      return { accepted: false, coinsAwarded: 0, transactionId: payload.idempotencyKey };
    }

    await this.coins.addCoins(payload.coins, 'LEVEL_REWARD', 'level_complete', payload.levelId);
    await this.markProcessed(payload.idempotencyKey);

    return { accepted: true, coinsAwarded: payload.coins, transactionId: payload.idempotencyKey };
  }

  async redeemCoins(payload: RedeemRequest): Promise<RedeemResponse> {
    if (!environment.features.redemptionEnabled) {
      throw new RedeemApiError(
        'Redemption is not available yet — it requires the centralized wallet backend, which is not connected in this build.',
        'REDEMPTION_DISABLED',
      );
    }

    try {
      const envelope = await firstValueFrom(
        this.http.post<any>(`${environment.apiBaseUrl}/redeem`, payload),
      );

      if (envelope && (envelope.success === false || envelope.error)) {
        const errObj = envelope.error;
        const msg =
          typeof errObj === 'string'
            ? errObj
            : errObj?.message || envelope.message || 'Redemption failed.';
        const code = errObj?.code || envelope.code || 'VALIDATION_ERROR';
        throw new RedeemApiError(msg, code);
      }

      if (!envelope?.data) {
        throw new RedeemApiError('Invalid response from reward server.', 'INVALID_RESPONSE');
      }

      return envelope.data;
    } catch (err) {
      if (err instanceof RedeemApiError) {
        throw err;
      }
      throw this.normalizeError(err);
    }
  }

  private normalizeError(err: unknown): RedeemApiError {
    if (err instanceof HttpErrorResponse) {
      let body: any = err.error;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          // not JSON string
        }
      }

      const message =
        body?.error?.message ||
        (typeof body?.error === 'string' ? body.error : null) ||
        body?.message ||
        (typeof body === 'string' && body.length > 0 && body.length < 250 ? body : null);

      const code = body?.error?.code || body?.code || 'API_ERROR';

      if (message) {
        return new RedeemApiError(message, code);
      }
      if (err.status === 0) {
        return new RedeemApiError(
          'Network error. Please check your connection and try again.',
          'NETWORK_ERROR',
        );
      }
    }
    return new RedeemApiError(
      err instanceof Error ? err.message : 'Something went wrong. Please try again.',
      'UNKNOWN_ERROR',
    );
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    const stored = await this.storage.get<string[]>(PROCESSED_KEYS_KEY);
    this.processedKeys = new Set(stored ?? []);
    this.loaded = true;
  }

  private async markProcessed(key: string): Promise<void> {
    this.processedKeys.add(key);
    const trimmed = Array.from(this.processedKeys).slice(-MAX_TRACKED_KEYS);
    this.processedKeys = new Set(trimmed);
    await this.storage.set(PROCESSED_KEYS_KEY, trimmed);
  }
}
