import { GameRewardSubmission, RedeemRequest, RedeemResponse } from '../models/economy.models';

export interface GameRewardResult {
  accepted: boolean;
  coinsAwarded: number;
  transactionId: string;
}

/**
 * Seam for the future centralized reward/wallet backend described in the project brief:
 *
 *   Arrow Rush -> Central Game Reward API -> Central Wallet -> main app -> Withdrawal
 *
 * The frontend never computes a redeemable rupee amount — callers must always read
 * `amountCredited` back from redeemCoins()'s response. Until that backend exists,
 * LocalGameRewardApiService below stands in and keeps gameplay fully offline-capable.
 */
export abstract class GameRewardApiService {
  abstract submitGameReward(payload: GameRewardSubmission): Promise<GameRewardResult>;
  abstract redeemCoins(payload: RedeemRequest): Promise<RedeemResponse>;
}
