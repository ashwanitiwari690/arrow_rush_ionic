#!/usr/bin/env node
/** Sanity check: every generated level must be solvable by repeatedly removing any
 * block whose path to the edge is currently clear, until none remain. */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LEVELS_DIR = join(__dirname, '..', 'src', 'assets', 'levels');

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

function isSolvable(level) {
  let blocks = level.blocks.map((b) => ({ ...b }));
  const occupiedKeys = () => {
    const set = new Set();
    for (const b of blocks) set.add(`${b.row}:${b.column}`);
    for (const o of level.obstacles) set.add(`${o.row}:${o.column}`);
    return set;
  };

  while (blocks.length > 0) {
    const occupied = occupiedKeys();
    const movable = blocks.find((b) => {
      const path = pathToEdge(b.row, b.column, b.direction, level.rows, level.columns);
      return path.every((c) => {
        const key = `${c.row}:${c.column}`;
        return !occupied.has(key) || key === `${b.row}:${b.column}`;
      });
    });
    if (!movable) return false;
    blocks = blocks.filter((b) => b.id !== movable.id);
  }
  return true;
}

const files = readdirSync(LEVELS_DIR).filter((f) => /^level-\d+\.json$/.test(f));
let failures = 0;
for (const file of files) {
  const level = JSON.parse(readFileSync(join(LEVELS_DIR, file), 'utf-8'));
  if (!isSolvable(level)) {
    failures++;
    console.error(`UNSOLVABLE: ${file}`);
  }
}

console.log(`Checked ${files.length} levels, ${failures} unsolvable.`);
process.exit(failures > 0 ? 1 : 0);
