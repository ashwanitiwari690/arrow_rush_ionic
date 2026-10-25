import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'src', 'assets', 'levels');
const COUNT = 520;

const COLORS = ['purple', 'blue', 'green', 'red', 'yellow'];
const DIRECTIONS = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

// Deterministic PRNG (mulberry32) so regenerating the pack is reproducible.
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function difficultyForLevel(n) {
  if (n <= 40) return 'EASY';
  if (n <= 120) return 'MEDIUM';
  if (n <= 240) return 'HARD';
  if (n <= 360) return 'EXPERT';
  if (n <= 450) return 'MASTER';
  return 'INSANE';
}

function paramsForDifficulty(difficulty, n) {
  switch (difficulty) {
    case 'EASY':
      return {
        rows: 5,
        columns: 5,
        blocks: 10 + Math.floor((n - 1) / 10), // 10 to 13 blocks
        obstacles: 2 + Math.floor((n - 1) / 20),
        maxInitialMovable: 4,
        timeLimitSeconds: 80,
        lives: 3,
        reward: { coins: 15, score: 600 },
      };
    case 'MEDIUM':
      return {
        rows: 6,
        columns: 6,
        blocks: 15 + Math.floor((n - 41) / 14), // 15 to 20 blocks
        obstacles: 3 + Math.floor((n - 41) / 25),
        maxInitialMovable: 5,
        timeLimitSeconds: 75,
        lives: 3,
        reward: { coins: 25, score: 1000 },
      };
    case 'HARD':
      return {
        rows: 7,
        columns: 7,
        blocks: 21 + Math.floor((n - 121) / 16), // 21 to 28 blocks
        obstacles: 4 + Math.floor((n - 121) / 30),
        maxInitialMovable: 6,
        timeLimitSeconds: 70,
        lives: 3,
        reward: { coins: 35, score: 1500 },
      };
    case 'EXPERT':
      return {
        rows: 8,
        columns: 8,
        blocks: 27 + Math.floor((n - 241) / 18), // 27 to 33 blocks
        obstacles: 5 + Math.floor((n - 241) / 30),
        maxInitialMovable: 7,
        timeLimitSeconds: 65,
        lives: 3,
        reward: { coins: 45, score: 2000 },
      };
    case 'MASTER':
      return {
        rows: 9,
        columns: 9,
        blocks: 34 + Math.floor((n - 361) / 16), // 34 to 39 blocks
        obstacles: 6 + Math.floor((n - 361) / 25),
        maxInitialMovable: 8,
        timeLimitSeconds: 60,
        lives: 3,
        reward: { coins: 60, score: 2600 },
      };
    case 'INSANE':
    default:
      return {
        rows: 10,
        columns: 10,
        blocks: 42 + Math.floor((n - 451) / 12), // 42 to 47 blocks
        obstacles: 8 + Math.floor((n - 451) / 20),
        maxInitialMovable: 10,
        timeLimitSeconds: 55,
        lives: 3,
        reward: { coins: 75, score: 3500 },
      };
  }
}

function cellKey(row, column) {
  return `${row}:${column}`;
}

function pathToEdge(row, column, direction, rows, columns) {
  const path = [];
  switch (direction) {
    case 'UP':
      for (let r = row - 1; r >= 0; r--) path.push({ row: r, column });
      break;
    case 'DOWN':
      for (let r = row + 1; r < rows; r++) path.push({ row: r, column });
      break;
    case 'LEFT':
      for (let c = column - 1; c >= 0; c--) path.push({ row, column: c });
      break;
    case 'RIGHT':
      for (let c = column + 1; c < columns; c++) path.push({ row, column: c });
      break;
  }
  return path;
}

function isSolvable(blocks, obstacles, rows, columns) {
  let rem = blocks.map((b) => ({ ...b }));
  const occupiedKeys = () => {
    const set = new Set();
    for (const b of rem) set.add(`${b.row}:${b.column}`);
    for (const o of obstacles) set.add(`${o.row}:${o.column}`);
    return set;
  };

  while (rem.length > 0) {
    const occupied = occupiedKeys();
    const movable = rem.find((b) => {
      const path = pathToEdge(b.row, b.column, b.direction, rows, columns);
      return path.every((c) => !occupied.has(`${c.row}:${c.column}`));
    });
    if (!movable) return false;
    rem = rem.filter((b) => b.id !== movable.id);
  }
  return true;
}

/** Builds one solvable, interlocking puzzle level via reverse chained construction. */
function buildLevel(levelId, rng, tryIndex) {
  const difficulty = difficultyForLevel(levelId);
  const p = paramsForDifficulty(difficulty, levelId);
  const { rows, columns } = p;

  const occupied = new Set();
  const obstacles = [];
  const reverseSlots = [];

  // 1. Place obstacles (walls)
  let obstacleAttempts = 0;
  while (obstacles.length < p.obstacles && obstacleAttempts < p.obstacles * 40) {
    obstacleAttempts++;
    const row = Math.floor(rng() * rows);
    const column = Math.floor(rng() * columns);
    const key = cellKey(row, column);
    if (occupied.has(key)) continue;
    occupied.add(key);
    obstacles.push({ id: `obstacle_${obstacles.length + 1}`, row, column, type: 'WALL' });
  }

  // 2. Reverse construction with blocker chaining to ensure deep interlocking
  let attempts = 0;
  const maxAttempts = tryIndex > 30 ? p.blocks * 600 : p.blocks * 300;

  while (reverseSlots.length < p.blocks && attempts < maxAttempts) {
    attempts++;
    let placed = false;

    // With 75% bias, try placing directly in front of an existing block to trap it
    if (reverseSlots.length > 0 && rng() < 0.75) {
      const candidates = [];
      for (const b of reverseSlots) {
        const path = pathToEdge(b.row, b.column, b.direction, rows, columns);
        for (const cell of path) {
          if (!occupied.has(cellKey(cell.row, cell.column))) {
            candidates.push(cell);
          }
        }
      }

      if (candidates.length > 0) {
        const nextCell = pick(rng, candidates);
        const validDirs = DIRECTIONS.filter((d) => {
          const path = pathToEdge(nextCell.row, nextCell.column, d, rows, columns);
          if (path.length === 0 && rng() > 0.2) return false;
          return path.every((cell) => !occupied.has(cellKey(cell.row, cell.column)));
        });
        if (validDirs.length > 0) {
          const dir = pick(rng, validDirs);
          occupied.add(cellKey(nextCell.row, nextCell.column));
          reverseSlots.push({ row: nextCell.row, column: nextCell.column, direction: dir });
          placed = true;
        }
      }
    }

    if (!placed) {
      const row = Math.floor(rng() * rows);
      const column = Math.floor(rng() * columns);
      if (!occupied.has(cellKey(row, column))) {
        const validDirs = DIRECTIONS.filter((d) => {
          const path = pathToEdge(row, column, d, rows, columns);
          if (path.length === 0 && rng() > 0.2) return false;
          return path.every((cell) => !occupied.has(cellKey(cell.row, cell.column)));
        });
        if (validDirs.length > 0) {
          const dir = pick(rng, validDirs);
          occupied.add(cellKey(row, column));
          reverseSlots.push({ row, column, direction: dir });
        }
      }
    }
  }

  if (reverseSlots.length < p.blocks) return null;

  const escapeOrder = [...reverseSlots].reverse();
  const blocks = escapeOrder.map((slot, index) => ({
    id: `block_${index + 1}`,
    row: slot.row,
    column: slot.column,
    direction: slot.direction,
    color: COLORS[index % COLORS.length],
    type: 'ARROW',
  }));

  // Verify that only a small number of arrows can escape initially
  const occ = new Set();
  blocks.forEach((b) => occ.add(cellKey(b.row, b.column)));
  obstacles.forEach((o) => occ.add(cellKey(o.row, o.column)));

  const initialMovables = blocks.filter((b) => {
    const path = pathToEdge(b.row, b.column, b.direction, rows, columns);
    return path.every((c) => !occ.has(cellKey(c.row, c.column)));
  });

  const allowedMovable = tryIndex > 60 ? p.maxInitialMovable + 6 : (tryIndex > 30 ? p.maxInitialMovable + 3 : (tryIndex > 15 ? p.maxInitialMovable + 1 : p.maxInitialMovable));
  if (initialMovables.length > allowedMovable) return null;
  if (!isSolvable(blocks, obstacles, rows, columns)) return null;

  return {
    levelId,
    difficulty,
    rows,
    columns,
    blocks,
    obstacles,
    specialBlocks: [],
    timeLimitSeconds: p.timeLimitSeconds,
    lives: p.lives,
    reward: p.reward,
  };
}

function generate() {
  mkdirSync(OUT_DIR, { recursive: true });
  const index = [];

  for (let levelId = 1; levelId <= COUNT; levelId++) {
    let level = null;
    let seed = levelId * 104729;
    let tries = 0;
    while (!level && tries < 300) {
      level = buildLevel(levelId, mulberry32(seed + tries * 97), tries);
      tries++;
    }
    if (!level) {
      throw new Error(`Failed to generate a solvable layout for level ${levelId}`);
    }

    writeFileSync(join(OUT_DIR, `level-${String(levelId).padStart(3, '0')}.json`), JSON.stringify(level));
    index.push({
      levelId: level.levelId,
      difficulty: level.difficulty,
      rows: level.rows,
      columns: level.columns,
      blockCount: level.blocks.length,
    });
  }

  writeFileSync(join(OUT_DIR, 'levels-index.json'), JSON.stringify(index));
  console.log(`Generated ${COUNT} levels into ${OUT_DIR}`);
}

generate();
