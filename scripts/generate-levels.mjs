#!/usr/bin/env node
/**
 * Generates the Arrow Rush level pack as data-driven JSON (src/assets/levels/*.json).
 *
 * Levels are NOT randomly dropped onto the board — each is built with a reverse
 * construction technique that guarantees at least one valid solve order exists:
 * blocks are placed on the grid in the REVERSE of their intended escape order, so
 * every block's exit path only ever has to avoid obstacles and blocks that are
 * already placed (i.e. blocks that will still be on the board when it's this
 * block's turn to move). This is the same guarantee-by-construction approach used
 * by classic sliding-block escape puzzles, and it lets difficulty be tuned by
 * parameters (grid size, block count, obstacle count) while every generated level
 * stays solvable by design. Run again with a bigger COUNT to grow past 1000 levels.
 *
 * Usage: node scripts/generate-levels.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'src', 'assets', 'levels');
const COUNT = 100;

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
  if (n <= 25) return 'EASY';
  if (n <= 55) return 'MEDIUM';
  if (n <= 85) return 'HARD';
  return 'EXPERT';
}

function paramsForDifficulty(difficulty, n) {
  switch (difficulty) {
    case 'EASY':
      return {
        rows: 5,
        columns: 5,
        blocks: 5 + Math.floor(n / 8),
        obstacles: 2 + Math.floor(n / 10),
        timeLimitSeconds: 100,
        lives: 3,
        reward: { coins: 10, score: 500 },
      };
    case 'MEDIUM':
      return {
        rows: 6,
        columns: 6,
        blocks: 8 + Math.floor((n - 25) / 6),
        obstacles: 4 + Math.floor((n - 25) / 8),
        timeLimitSeconds: 90,
        lives: 3,
        reward: { coins: 20, score: 800 },
      };
    case 'HARD':
      return {
        rows: 7,
        columns: 7,
        blocks: 11 + Math.floor((n - 55) / 6),
        obstacles: 6 + Math.floor((n - 55) / 6),
        timeLimitSeconds: 80,
        lives: 3,
        reward: { coins: 30, score: 1200 },
      };
    default:
      return {
        rows: 8,
        columns: 8,
        blocks: 15 + Math.floor((n - 85) / 4),
        obstacles: 10 + Math.floor((n - 85) / 4),
        timeLimitSeconds: 75,
        lives: 3,
        reward: { coins: 40, score: 1600 },
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
  const maxGlobalAttempts = p.blocks * 200;

  while (placedCount < p.blocks && globalAttempts < maxGlobalAttempts) {
    globalAttempts++;
    const row = Math.floor(rng() * rows);
    const column = Math.floor(rng() * columns);
    const key = cellKey(row, column);
    if (occupied.has(key)) continue;

    const direction = pick(rng, DIRECTIONS);
    const path = pathToEdge(row, column, direction, rows, columns);
    if (path.length === 0) continue; // already on the edge facing out — trivial, skip for variety
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
    while (!level && tries < 10) {
      level = buildLevel(levelId, mulberry32(seed + tries));
      tries++;
    }
    if (!level) {
      throw new Error(`Failed to generate a solvable layout for level ${levelId}`);
    }

    writeFileSync(join(OUT_DIR, `level-${String(levelId).padStart(3, '0')}.json`), JSON.stringify(level, null, 2));
    index.push({
      levelId: level.levelId,
      difficulty: level.difficulty,
      rows: level.rows,
      columns: level.columns,
      blockCount: level.blocks.length,
    });
  }

  writeFileSync(join(OUT_DIR, 'levels-index.json'), JSON.stringify(index, null, 2));
  console.log(`Generated ${COUNT} levels into ${OUT_DIR}`);
}

generate();
