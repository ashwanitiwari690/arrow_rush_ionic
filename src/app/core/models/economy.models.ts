export type CoinTransactionType =
  | 'LEVEL_REWARD'
  | 'DAILY_CHALLENGE'
  | 'THEME_PURCHASE'
  | 'POWERUP_PURCHASE'
  | 'ACHIEVEMENT'
  | 'REDEMPTION';

export type CoinTransactionStatus = 'PENDING' | 'CONFIRMED' | 'FAILED';

export interface CoinTransaction {
  id: string;
  type: CoinTransactionType;
  amount: number;
  source: string;
  levelId?: number;
  timestamp: number;
  status: CoinTransactionStatus;
}

export interface LevelProgress {
  levelId: number;
  completed: boolean;
  unlocked: boolean;
  stars: number;
  bestScore: number;
  bestTimeSeconds: number | null;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  isUnlocked: boolean;
  unlockedAt: number | null;
}

export interface DailyChallengeStatus {
  date: string;
  levelId: number;
  attemptsUsed: number;
  maxAttempts: number;
  completed: boolean;
  rewardClaimed: boolean;
}

export interface RedeemRequest {
  gameCode: string;
  mobileNumber: string;
  coins: number;
  idempotencyKey: string;
}

/** Shape of the centralized Game Reward API's `POST {apiBaseUrl}/redeem` response. Money
 * fields come back as strings from the backend (e.g. "15.00") — never parsed into a
 * frontend-computed number, per the "backend is authoritative for rupee amounts" rule. */
export interface RedeemResponse {
  gameCode: string;
  gameName: string;
  coinsSubmitted: number;
  coinsRedeemed: number;
  coinsPerConversion: number;
  rupeesPerConversion: number;
  amountCredited: string;
  transactionId: string;
  idempotencyKey: string;
  status: string;
  createdAt: string;
  newWalletBalance: string;
}

export interface RedeemApiErrorEnvelope {
  success: false;
  error: { code: string; message: string };
}

export interface GameRewardSubmission {
  gameCode: string;
  levelId: number;
  score: number;
  coins: number;
  idempotencyKey: string;
}
