
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
        blocks: 6 + Math.floor((n - 1) / 10),
        obstacles: 2 + Math.floor((n - 1) / 15),
        timeLimitSeconds: 110,
        lives: 3,
        reward: { coins: 10, score: 500 },
      };
    case 'MEDIUM':
      return {
        rows: 6,
        columns: 6,
        blocks: 10 + Math.floor((n - 41) / 12),
        obstacles: 3 + Math.floor((n - 41) / 20),
        timeLimitSeconds: 95,
        lives: 3,
        reward: { coins: 20, score: 800 },
      };
    case 'HARD':
      return {
        rows: 7,
        columns: 7,
        blocks: 15 + Math.floor((n - 121) / 15),
        obstacles: 5 + Math.floor((n - 121) / 20),
        timeLimitSeconds: 85,
        lives: 3,
        reward: { coins: 30, score: 1200 },
      };
    case 'EXPERT':
      return {
        rows: 8,
        columns: 8,
        blocks: 20 + Math.floor((n - 241) / 12),
        obstacles: 7 + Math.floor((n - 241) / 16),
        timeLimitSeconds: 75,
        lives: 3,
        reward: { coins: 40, score: 1600 },
      };
    case 'MASTER':
      return {
        rows: 9,
        columns: 9,
        blocks: 26 + Math.floor((n - 361) / 9),
        obstacles: 10 + Math.floor((n - 361) / 14),
        timeLimitSeconds: 70,
        lives: 3,
        reward: { coins: 50, score: 2200 },
      };
    case 'INSANE':
    default:
      return {
        rows: 10,
        columns: 10,
        blocks: 34 + Math.floor((n - 451) / 6),
        obstacles: 12 + Math.floor((n - 451) / 10),
        timeLimitSeconds: 65,
        lives: 3,
        reward: { coins: 60, score: 3000 },
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

/** Builds one solvable level via reverse construction. Returns null on the rare case
 * retries are exhausted (caller retries with a fresh seed). */
function buildLevel(levelId, rng) {
  const difficulty = difficultyForLevel(levelId);
  const p = paramsForDifficulty(difficulty, levelId);
  const { rows, columns } = p;

  const occupied = new Set();
  const obstacles = [];
  const blocks = [];

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

  // Place blocks in REVERSE escape order: block N (escapes last) is placed first, so
  // block K's exit path only has to dodge obstacles + blocks K+1..N, which are already down.
  const reverseSlots = [];
  let placedCount = 0;
  let globalAttempts = 0;
  const maxGlobalAttempts = p.blocks * 400;

  while (placedCount < p.blocks && globalAttempts < maxGlobalAttempts) {
    globalAttempts++;
    const row = Math.floor(rng() * rows);
    const column = Math.floor(rng() * columns);
    const key = cellKey(row, column);
    if (occupied.has(key)) continue;

    const direction = pick(rng, DIRECTIONS);
    const path = pathToEdge(row, column, direction, rows, columns);
    if (path.length === 0 && rng() > 0.35) continue;
    if (path.some((c) => occupied.has(cellKey(c.row, c.column)))) continue;

    occupied.add(key);
    reverseSlots.push({ row, column, direction });
    placedCount++;
  }

  if (placedCount < p.blocks) return null;

  // reverseSlots[0] is block_N (escapes last) ... reverseSlots[last] is block_1 (escapes first).
  // Escape order for the solved-order-hint is the reverse of placement order.
  const escapeOrder = [...reverseSlots].reverse();
  escapeOrder.forEach((slot, index) => {
    blocks.push({
      id: `block_${index + 1}`,
      row: slot.row,
      column: slot.column,
      direction: slot.direction,
      color: COLORS[index % COLORS.length],
      type: 'ARROW',
    });
  });

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
    let seed = levelId * 104729; // large prime spacing keeps seeds well distributed
    let tries = 0;
    while (!level && tries < 25) {
      level = buildLevel(levelId, mulberry32(seed + tries));
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
