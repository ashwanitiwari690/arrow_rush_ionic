import { Injectable, computed, inject, signal } from '@angular/core';
import { GameState, LevelData, MoveResult } from '../models/game.models';
import { GameEngineService } from './game-engine.service';

/**
 * Reactive session wrapper around the pure GameEngineService. Owns the signal the game
 * screen renders from; all mutation goes through here so the engine itself stays pure.
 */
@Injectable({ providedIn: 'root' })
export class GameStateService {
  private readonly engine = inject(GameEngineService);

  private readonly _state = signal<GameState | null>(null);
  private _level: LevelData | null = null;

  readonly state = this._state.asReadonly();
  readonly isComplete = computed(() => this._state()?.isComplete ?? false);
  readonly remainingBlocks = computed(() => this._state()?.blocks.length ?? 0);

  startLevel(level: LevelData): void {
    this._level = level;
    this._state.set(this.engine.initializeLevel(level));
  }

  restart(): void {
    if (!this._level) return;
    this._state.set(this.engine.restart(this._level));
  }

  canMove(blockId: string): boolean {
    const state = this._state();
    if (!state) return false;
    return this.engine.canMove(state, blockId);
  }

  move(blockId: string): MoveResult | null {
    const state = this._state();
    if (!state) return null;

    const result = this.engine.moveBlock(state, blockId);
    if (result.moved || result.blocked) {
      this._state.set(result.state);
    }
    return result;
  }

  undo(): boolean {
    const state = this._state();
    if (!state) return false;

    const previous = this.engine.undo(state);
    if (!previous) return false;

    this._state.set(previous);
    return true;
  }

  hintBlockId(): string | null {
    const state = this._state();
    if (!state) return null;
    return this.engine.getHintBlockId(state);
  }

  markFailed(): void {
    const state = this._state();
    if (!state) return;
    this._state.set({ ...state, isFailed: true });
  }

  /** Replaces the remaining blocks' positions/directions (used by the Shuffle power-up)
   * without touching escaped blocks, obstacles, moves or score. */
  applyShuffledBlocks(blocks: GameState['blocks']): void {
    const state = this._state();
    if (!state) return;
    this._state.set({ ...state, blocks });
  }

  currentLevel(): LevelData | null {
    return this._level;
  }

  finalScore(elapsedSeconds: number, powerUpsUsed: number): number {
    const state = this._state();
    if (!state || !this._level) return 0;
    const idealMoves = this._level.blocks.length;
    return this.engine.calculateScore(
      state,
      elapsedSeconds,
      this._level.timeLimitSeconds,
      idealMoves,
      powerUpsUsed,
    );
  }

  clear(): void {
    this._state.set(null);
    this._level = null;
  }
}
