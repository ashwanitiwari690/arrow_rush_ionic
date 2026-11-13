import { TestBed } from '@angular/core/testing';
import { ArrowBlock, LevelData } from '../models/game.models';
import { GameEngineService } from './game-engine.service';
import { ShuffleService } from './shuffle.service';

const makeLevel = (): LevelData => ({
  levelId: 1, difficulty: 'HARD', rows: 8, columns: 8,
  blocks: Array.from({ length: 24 }, (_, i): ArrowBlock => ({
    id: `arrow-${i}`, row: Math.floor(i / 8), column: i % 8,
    direction: 'RIGHT', color: i % 2 === 0 ? 'purple' : 'blue', type: 'ARROW',
  })),
  obstacles: [{ id: 'wall', row: 4, column: 4, type: 'WALL' }],
  specialBlocks: [], timeLimitSeconds: 120, lives: 3, reward: { coins: 10, score: 500 },
});

describe('ShuffleService', () => {
  afterEach(() => { vi.restoreAllMocks(); TestBed.resetTestingModule(); });

  it.each([1, 42, 31415])('produces a solvable board and preserves arrow identity and source state (seed %i)', (seed) => {
    let randomState = seed;
    vi.spyOn(Math, 'random').mockImplementation(() => {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      return randomState / 4294967296;
    });
    const engine = TestBed.inject(GameEngineService);
    const original = engine.initializeLevel(makeLevel());
    const snapshot = structuredClone(original);
    const blocks = TestBed.inject(ShuffleService).shuffle(original);
    expect(blocks).not.toBeNull();
    expect(blocks!.map(({ id, color }) => ({ id, color }))).toEqual(original.blocks.map(({ id, color }) => ({ id, color })));
    expect(new Set(blocks!.map((b) => `${b.row}:${b.column}`)).size).toBe(blocks!.length);
    let state = { ...original, blocks: blocks! };
    for (const block of blocks!) {
      expect(block.row === 4 && block.column === 4).toBe(false);
      const move = engine.moveBlock(state, block.id);
      expect(move.moved).toBe(true);
      state = move.state;
    }
    expect(state.isComplete).toBe(true);
    expect(original).toEqual(snapshot);
  });

  it('returns no layout after bounded attempts when no cell is available', () => {
    const state = TestBed.inject(GameEngineService).initializeLevel(makeLevel());
    state.rows = 1; state.columns = 1; state.blocks = state.blocks.slice(0, 1);
    state.obstacles = [{ id: 'wall', row: 0, column: 0, type: 'WALL' }];
    const original = structuredClone(state);
    expect(TestBed.inject(ShuffleService).shuffle(state)).toBeNull();
    expect(state).toEqual(original);
  });
});
