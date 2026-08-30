import { Component, OnInit, inject } from '@angular/core';
import { CoinService } from '../../../core/services/coin.service';
import { LevelService } from '../../../core/services/level.service';
import { ScoreService } from '../../../core/services/score.service';
import { AchievementService } from '../../../core/services/achievement.service';
import { ConfigService } from '../../../core/services/config.service';
import { GameRewardApiService } from '../../../core/services/game-reward-api.service';
import { RedeemApiError } from '../../../core/services/local-game-reward-api.service';
import { StorageService } from '../../../core/services/storage.service';
import { environment } from '../../../../environments/environment';

const IDEMPOTENCY_KEY_STORAGE = 'arrow_rush.redeem_idempotency';

interface RedeemKeySnapshot {
  key: string;
  coins: number;
  mobileNumber: string;
}

type RedeemState = 'idle' | 'loading' | 'success' | 'error';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: false,
})
export class ProfilePage implements OnInit {
  private readonly coinService = inject(CoinService);
  private readonly levelService = inject(LevelService);
  private readonly scoreService = inject(ScoreService);
  private readonly achievementService = inject(AchievementService);
  private readonly config = inject(ConfigService);
  private readonly rewardApi = inject(GameRewardApiService);
  private readonly storage = inject(StorageService);

  readonly balance = this.coinService.balance;
  readonly achievements = this.achievementService.achievements;
  readonly totalScore = this.scoreService.totalScore;
  readonly redemptionEnabled = environment.features.redemptionEnabled;
  readonly minimumRedeemCoins = environment.coinConversion.minimumRedeemCoins;

  totalLevels = 100;
  withdrawNumber = '';
  redeemState: RedeemState = 'idle';
  redeemMessage: string | null = null;
  redeemedRupees: string | null = null;

  // Tracks a (coins, mobileNumber) pair the backend already reported as processed, so we
  // don't let the user hammer the same submission again until something actually changes.
  private duplicateSnapshot: RedeemKeySnapshot | null = null;

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.coinService.init(),
      this.levelService.init(),
      this.achievementService.init(),
    ]);
    const gameConfig = await this.config.getGameConfig();
    this.totalLevels = gameConfig.totalLevels;
  }

  get completedCount(): number {
    return this.levelService.completedCount();
  }

  get bestLevelId(): number {
    let best = 0;
    for (const p of Object.values(this.levelService.progress())) {
      if (p.completed) best = Math.max(best, p.levelId);
    }
    return best;
  }

  get isRedeeming(): boolean {
    return this.redeemState === 'loading';
  }

  /** Gates the entire withdraw form, not just the submit button — the input box itself
   * only appears once the player has actually reached the minimum. */
  get canWithdraw(): boolean {
    return this.redemptionEnabled && this.balance() >= this.minimumRedeemCoins;
  }

  get progressPercent(): number {
    return Math.min(100, Math.round((this.balance() / this.minimumRedeemCoins) * 100));
  }

  get withdrawNumberValid(): boolean {
    return /^\d{10}$/.test(this.withdrawNumber);
  }

  get isBlockedByDuplicate(): boolean {
    return (
      this.duplicateSnapshot !== null &&
      this.duplicateSnapshot.coins === this.balance() &&
      this.duplicateSnapshot.mobileNumber === this.withdrawNumber
    );
  }

  /** Strips non-digits and caps at 10 as the user types, rather than merely flagging an
   * already-invalid value — matches how a phone-number field should feel to type into. */
  onWithdrawNumberInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.withdrawNumber = input.value.replace(/\D/g, '').slice(0, 10);
  }

  async onWithdraw(): Promise<void> {
    if (this.isRedeeming || !this.withdrawNumberValid || !this.canWithdraw || this.isBlockedByDuplicate) {
      return;
    }

    this.redeemState = 'loading';
    this.redeemMessage = null;

    const coins = this.balance();
    const idempotencyKey = await this.getOrCreateIdempotencyKey(coins, this.withdrawNumber);

    try {
      const response = await this.rewardApi.redeemCoins({
        gameCode: environment.gameCode,
        mobileNumber: this.withdrawNumber,
        coins,
        idempotencyKey,
      });

      // Backend is the source of truth for both the deducted coins and the ₹ amount —
      // coins were never touched locally before this point, so a failure above is a
      // safe, retryable state with nothing to roll back.
      await this.coinService.confirmRedemption(response.coinsRedeemed);
      this.redeemedRupees = response.amountCredited;
      this.redeemState = 'success';
      await this.storage.remove(IDEMPOTENCY_KEY_STORAGE);
    } catch (err) {
      this.handleRedeemFailure(err, coins);
    }
  }

  dismissRedeemResult(): void {
    this.redeemState = 'idle';
    this.redeemMessage = null;
    this.redeemedRupees = null;
    this.withdrawNumber = '';
    this.duplicateSnapshot = null;
  }

  private handleRedeemFailure(err: unknown, coins: number): void {
    if (err instanceof RedeemApiError && err.errorCode === 'DUPLICATE_CONVERSION') {
      this.duplicateSnapshot = { key: '', coins, mobileNumber: this.withdrawNumber };
      this.redeemMessage = 'This redemption was already processed.';
    } else {
      this.redeemMessage = err instanceof Error ? err.message : 'Redemption failed. Please try again.';
    }
    this.redeemState = 'error';
  }

  /** Reuses the same idempotency key for a retry of the identical (coins, mobileNumber)
   * pair — safe for the backend to treat as the same attempt — and mints a fresh one the
   * moment either value actually changes. */
  private async getOrCreateIdempotencyKey(coins: number, mobileNumber: string): Promise<string> {
    const stored = await this.storage.get<RedeemKeySnapshot>(IDEMPOTENCY_KEY_STORAGE);
    if (stored && stored.coins === coins && stored.mobileNumber === mobileNumber) {
      return stored.key;
    }

    const key = crypto.randomUUID();
    await this.storage.set<RedeemKeySnapshot>(IDEMPOTENCY_KEY_STORAGE, { key, coins, mobileNumber });
    return key;
  }
}
