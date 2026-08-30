export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export type BlockColor = 'purple' | 'blue' | 'green' | 'red' | 'yellow';

export type Difficulty =
  | 'EASY'
  | 'MEDIUM'
  | 'HARD'
  | 'EXPERT'
  | 'MASTER'
  | 'INSANE';

export interface Cell {
  row: number;
  column: number;
}

/** A block the player can move. Currently always a single cell; `length`/`orientation`
 * are reserved so multi-cell arrows can be added later without a schema change. */
export interface ArrowBlock extends Cell {
  id: string;
  direction: Direction;
  color: BlockColor;
  type: 'ARROW';
}

export type ObstacleType = 'WALL';

export interface Obstacle extends Cell {
  id: string;
  type: ObstacleType;
}

/** Reserved for future mechanics (e.g. bombs, freezers) referenced in the design brief.
 * No special block types ship in v1; the field exists so level JSON stays forward-compatible. */
export interface SpecialBlock extends Cell {
  id: string;
  type: string;
}

export interface RewardConfigRef {
  coins: number;
  score: number;
}

export interface LevelData {
  levelId: number;
  difficulty: Difficulty;
  rows: number;
  columns: number;
  blocks: ArrowBlock[];
  obstacles: Obstacle[];
  specialBlocks: SpecialBlock[];
  timeLimitSeconds: number;
  lives: number;
  reward: RewardConfigRef;
}

export interface LevelSummary {
  levelId: number;
  difficulty: Difficulty;
  rows: number;
  columns: number;
  blockCount: number;
}

export type PowerUpType = 'HINT' | 'UNDO' | 'SHUFFLE' | 'EXTRA';

export interface GameStateSnapshot {
  blocks: ArrowBlock[];
  obstacles: Obstacle[];
  escapedBlockIds: string[];
  moves: number;
  score: number;
}

export interface GameState {
  levelId: number;
  rows: number;
  columns: number;
  blocks: ArrowBlock[];
  obstacles: Obstacle[];
  specialBlocks: SpecialBlock[];
  escapedBlockIds: string[];
  moves: number;
  score: number;
  livesRemaining: number;
  isComplete: boolean;
  isFailed: boolean;
  history: GameStateSnapshot[];
}

export interface MoveResult {
  moved: boolean;
  blocked: boolean;
  path: Cell[];
  escaped: boolean;
  state: GameState;
}
