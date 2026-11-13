import { Injectable, inject } from '@angular/core';
import {
  ArrowBlock,
  GameState,
  GameStateSnapshot,
  LevelData,
  MoveResult,
} from '../models/game.models';
import { MoveValidatorService } from './move-validator.service';

const MAX_HISTORY = 20;
const SCORE_PER_ESCAPE = 100;
const SCORE_PER_REMAINING_SECOND = 2;
const SCORE_PENALTY_PER_EXTRA_MOVE = 5;

/**
 * Pure, UI-independent puzzle engine. No Ionic/Angular-template dependency so it can be
 * unit tested and reasoned about in isolation from the rendering layer.
 */
@Injectable({ providedIn: 'root' })
export class GameEngineService {
  private readonly validator = inject(MoveValidatorService);

  initializeLevel(level: LevelData): GameState {
    return {
      levelId: level.levelId,
      rows: level.rows,
      columns: level.columns,
      blocks: level.blocks.map((b) => ({ ...b })),
      obstacles: level.obstacles.map((o) => ({ ...o })),
      specialBlocks: level.specialBlocks.map((s) => ({ ...s })),
      escapedBlockIds: [],
      moves: 0,
      score: 0,
      livesRemaining: level.lives,
      isComplete: false,
      isFailed: false,
      history: [],
    };
  }

  restart(level: LevelData): GameState {
    return this.initializeLevel(level);
  }

  canMove(state: GameState, blockId: string): boolean {
    return this.validator.canMove(state, blockId);
  }

  /** Attempts to move a block. Returns a new state on success; on a blocked move the state
   * is unchanged (caller drives the "blocked" shake/sound feedback off `blocked: true`). */
  moveBlock(state: GameState, blockId: string): MoveResult {
    if (state.isComplete || state.isFailed) {
      return { moved: false, blocked: false, path: [], escaped: false, state };
    }
    const block = state.blocks.find((b) => b.id === blockId);
    if (!block) {
      return { moved: false, blocked: false, path: [], escaped: false, state };
    }

    const path = this.validator.calculatePath(state, block);
    // Reuse the path and occupancy data for this move instead of rebuilding both.
    const occupied = this.validator.getOccupiedCellSet(state);
    occupied.delete(`${block.row}:${block.column}`);
    const clear = this.validator.isPathClear(path, occupied);

    if (!clear) {
      const livesRemaining = Math.max(0, state.livesRemaining - 1);
      const blockedState: GameState = {
        ...state,
        livesRemaining,
        isFailed: livesRemaining <= 0,
      };
      return { moved: false, blocked: true, path, escaped: false, state: blockedState };
    }

    const snapshot = this.snapshot(state);
    const nextBlocks = state.blocks.filter((b) => b.id !== blockId);
    const nextEscaped = [...state.escapedBlockIds, blockId];

    const nextState: GameState = {
      ...state,
      blocks: nextBlocks,
      escapedBlockIds: nextEscaped,
      moves: state.moves + 1,
      score: state.score + SCORE_PER_ESCAPE,
      history: [...state.history.slice(-MAX_HISTORY + 1), snapshot],
    };

    nextState.isComplete = this.isLevelComplete(nextState);

    return { moved: true, blocked: false, path, escaped: true, state: nextState };
  }

  undo(state: GameState): GameState | null {
    if (state.history.length === 0) return null;

    const previous = state.history[state.history.length - 1];
    return {
      ...state,
      blocks: previous.blocks.map((b) => ({ ...b })),
      escapedBlockIds: [...previous.escapedBlockIds],
      moves: previous.moves,
      score: previous.score,
      isComplete: false,
      history: state.history.slice(0, -1),
    };
  }

  isLevelComplete(state: GameState): boolean {
    return state.blocks.length === 0;
  }

  /** First block (if any) that can currently escape — used to drive the Hint power-up. */
  getHintBlockId(state: GameState): string | null {
    const occupied = this.validator.getOccupiedCellSet(state);
    let closest: ArrowBlock | null = null;
    let shortest = Infinity;
    for (const block of state.blocks) {
      const distance = block.direction === 'UP' ? block.row
        : block.direction === 'DOWN' ? state.rows - block.row - 1
        : block.direction === 'LEFT' ? block.column : state.columns - block.column - 1;
      if (distance < shortest && this.validator.canMoveWithOccupied(state, block, occupied)) {
        closest = block;
        shortest = distance;
        if (distance === 0) break;
      }
    }
    return closest?.id ?? null;
  }

  hasAnyMove(state: GameState): boolean {
    const occupied = this.validator.getOccupiedCellSet(state);
    return state.blocks.some((b) => this.validator.canMoveWithOccupied(state, b, occupied));
  }

  calculateScore(
    state: GameState,
    elapsedSeconds: number,
    timeLimitSeconds: number,
    idealMoves: number,
    powerUpsUsed: number,
  ): number {
    const remaining = Math.max(0, timeLimitSeconds - elapsedSeconds);
    const timeBonus = Math.round(remaining * SCORE_PER_REMAINING_SECOND);
    const extraMoves = Math.max(0, state.moves - idealMoves);
    const movePenalty = extraMoves * SCORE_PENALTY_PER_EXTRA_MOVE;
    const powerUpPenalty = powerUpsUsed * 10;

    return Math.max(0, state.score + timeBonus - movePenalty - powerUpPenalty);
  }

  private snapshot(state: GameState): GameStateSnapshot {
    return {
      blocks: state.blocks.map((b) => ({ ...b })),
      obstacles: state.obstacles.map((o) => ({ ...o })),
      escapedBlockIds: [...state.escapedBlockIds],
      moves: state.moves,
      score: state.score,
    };
  }
}
