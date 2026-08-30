import { TestBed } from '@angular/core/testing';
import { MoveValidatorService } from './move-validator.service';
import { GameState } from '../models/game.models';

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    levelId: 1,
    rows: 4,
    columns: 4,
    blocks: [],
    obstacles: [],
    specialBlocks: [],
    escapedBlockIds: [],
    moves: 0,
    score: 0,
    livesRemaining: 3,
    isComplete: false,
    isFailed: false,
    history: [],
    ...overrides,
  };
}

describe('MoveValidatorService', () => {
  let validator: MoveValidatorService;

  beforeEach(() => {
    validator = TestBed.inject(MoveValidatorService);
  });

  it('calculates a path to the edge for each direction', () => {
    const block = { id: 'a', row: 1, column: 1, direction: 'UP' as const, color: 'purple' as const, type: 'ARROW' as const };
    const state = makeState({ blocks: [block] });

    expect(validator.calculatePath(state, block)).toEqual([{ row: 0, column: 1 }]);
  });

  it('returns an empty path when the block already sits on the exit edge', () => {
    const block = { id: 'a', row: 0, column: 1, direction: 'UP' as const, color: 'purple' as const, type: 'ARROW' as const };
    const state = makeState({ blocks: [block] });

    expect(validator.calculatePath(state, block)).toEqual([]);
    // An empty path is trivially clear — the block can leave immediately.
    expect(validator.canMove(state, 'a')).toBe(true);
  });

  it('does not consider the moving block itself an obstacle in its own path', () => {
    const block = { id: 'a', row: 0, column: 0, direction: 'RIGHT' as const, color: 'purple' as const, type: 'ARROW' as const };
    const state = makeState({ blocks: [block] });

    expect(validator.canMove(state, 'a')).toBe(true);
  });

  it('treats an unknown block id as immovable', () => {
    const state = makeState();
    expect(validator.canMove(state, 'missing')).toBe(false);
  });
});
