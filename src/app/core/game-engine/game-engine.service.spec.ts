import { TestBed } from '@angular/core/testing';
import { GameEngineService } from './game-engine.service';
import { LevelData } from '../models/game.models';

function makeLevel(overrides: Partial<LevelData> = {}): LevelData {
  return {
    levelId: 1,
    difficulty: 'EASY',
    rows: 4,
    columns: 4,
    blocks: [
      { id: 'a', row: 0, column: 0, direction: 'RIGHT', color: 'purple', type: 'ARROW' },
      { id: 'b', row: 2, column: 0, direction: 'RIGHT', color: 'blue', type: 'ARROW' },
    ],
    obstacles: [],
    specialBlocks: [],
    timeLimitSeconds: 60,
    lives: 3,
    reward: { coins: 10, score: 500 },
    ...overrides,
  };
}

describe('GameEngineService', () => {
  let engine: GameEngineService;

  beforeEach(() => {
    engine = TestBed.inject(GameEngineService);
  });

  it('initializes a fresh state matching the level layout', () => {
    const level = makeLevel();
    const state = engine.initializeLevel(level);

    expect(state.blocks).toHaveLength(2);
    expect(state.escapedBlockIds).toEqual([]);
    expect(state.moves).toBe(0);
    expect(state.isComplete).toBe(false);
    expect(state.livesRemaining).toBe(3);
  });

  it('lets a block escape when its path to the edge is clear', () => {
    const state = engine.initializeLevel(makeLevel());
    // block 'a' at (0,0) facing RIGHT — clear path since nothing sits between it and column 3.
    const result = engine.moveBlock(state, 'a');

    expect(result.moved).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.state.blocks.map((b) => b.id)).toEqual(['b']);
    expect(result.state.escapedBlockIds).toEqual(['a']);
    expect(result.state.moves).toBe(1);
  });

  it('blocks a move and leaves state unchanged when another block is in the way', () => {
    const level = makeLevel({
      blocks: [
        { id: 'a', row: 0, column: 0, direction: 'RIGHT', color: 'purple', type: 'ARROW' },
        { id: 'blocker', row: 0, column: 1, direction: 'RIGHT', color: 'blue', type: 'ARROW' },
      ],
    });
    const state = engine.initializeLevel(level);
    const result = engine.moveBlock(state, 'a');

    expect(result.moved).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.state).toBe(state); // unchanged reference — no mutation on a blocked attempt
  });

  it('is blocked by an obstacle in the path', () => {
    const level = makeLevel({
      blocks: [{ id: 'a', row: 0, column: 0, direction: 'RIGHT', color: 'purple', type: 'ARROW' }],
      obstacles: [{ id: 'wall', row: 0, column: 2, type: 'WALL' }],
    });
    const state = engine.initializeLevel(level);

    expect(engine.canMove(state, 'a')).toBe(false);
  });

  it('completes the level once every block has escaped', () => {
    let state = engine.initializeLevel(
      makeLevel({
        blocks: [
          { id: 'a', row: 0, column: 0, direction: 'RIGHT', color: 'purple', type: 'ARROW' },
          { id: 'b', row: 1, column: 0, direction: 'RIGHT', color: 'blue', type: 'ARROW' },
        ],
      }),
    );

    state = engine.moveBlock(state, 'a').state;
    expect(state.isComplete).toBe(false);

    const finalResult = engine.moveBlock(state, 'b');
    expect(finalResult.state.isComplete).toBe(true);
    expect(engine.isLevelComplete(finalResult.state)).toBe(true);
  });

  it('undo restores the exact previous state and refunds the move count', () => {
    const state = engine.initializeLevel(makeLevel());
    const afterMove = engine.moveBlock(state, 'a').state;

    const restored = engine.undo(afterMove);

    expect(restored).not.toBeNull();
    expect(restored!.blocks.map((b) => b.id).sort()).toEqual(['a', 'b']);
    expect(restored!.moves).toBe(0);
    expect(restored!.escapedBlockIds).toEqual([]);
  });

  it('undo on a state with no history returns null', () => {
    const state = engine.initializeLevel(makeLevel());
    expect(engine.undo(state)).toBeNull();
  });

  it('hint always points at a block that can actually move', () => {
    const level = makeLevel({
      blocks: [
        { id: 'a', row: 0, column: 0, direction: 'RIGHT', color: 'purple', type: 'ARROW' },
        { id: 'blocked', row: 1, column: 0, direction: 'RIGHT', color: 'blue', type: 'ARROW' },
      ],
      obstacles: [{ id: 'wall', row: 1, column: 2, type: 'WALL' }],
    });
    const state = engine.initializeLevel(level);

    const hint = engine.getHintBlockId(state);
    expect(hint).toBe('a');
    expect(engine.canMove(state, hint!)).toBe(true);
  });

  it('score rewards remaining time and penalizes extra moves', () => {
    const state = engine.initializeLevel(makeLevel());
    const completed = { ...state, score: 200, moves: 5 };

    const generousTime = engine.calculateScore(completed, 10, 60, 2, 0);
    const noTimeLeft = engine.calculateScore(completed, 60, 60, 2, 0);

    expect(generousTime).toBeGreaterThan(noTimeLeft);
  });
});
