import { Injectable, computed, inject } from '@angular/core';
import { LevelService } from './level.service';
import { ConfigService } from './config.service';

/** Aggregates the per-level best scores tracked by LevelService into a profile-level
 * total, and turns move efficiency into a star rating. Score stays a display/ranking
 * concept only — it is never converted into coins here (see CoinService for that seam). */
@Injectable({ providedIn: 'root' })
export class ScoreService {
  private readonly levelService = inject(LevelService);
  private readonly config = inject(ConfigService);

  readonly totalScore = computed(() =>
    Object.values(this.levelService.progress()).reduce((sum, p) => sum + p.bestScore, 0),
  );

  readonly bestLevelScore = computed(() =>
    Object.values(this.levelService.progress()).reduce((max, p) => Math.max(max, p.bestScore), 0),
  );

  async calculateStars(actualMoves: number, idealMoves: number): Promise<number> {
    const { starThresholds } = await this.config.getRewardConfig();
    if (idealMoves <= 0) return 3;

    const ratio = actualMoves / idealMoves;
    if (ratio <= starThresholds.threeStarMoveRatio) return 3;
    if (ratio <= starThresholds.twoStarMoveRatio) return 2;
    return 1;
  }
}
