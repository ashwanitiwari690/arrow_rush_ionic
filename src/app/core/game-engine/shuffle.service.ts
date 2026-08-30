import { Injectable } from '@angular/core';
import { ArrowBlock, Direction, GameState } from '../models/game.models';

const DIRECTIONS: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

/**
 * Re-lays-out the blocks still on the board (obstacles and escaped blocks are
 * untouched) using the same reverse-construction technique as the level generator
 * (see scripts/generate-levels.mjs), so the shuffled layout is guaranteed solvable —
 * shuffle can never hand the player a soft-locked board.
 */
@Injectable({ providedIn: 'root' })
export class ShuffleService {
  shuffle(state: GameState): ArrowBlock[] | null {
    const occupied = new Set<string>();
    for (const o of state.obstacles) occupied.add(this.key(o.row, o.column));

    const colors = state.blocks.map((b) => b.color);
    const reverseSlots: { row: number; column: number; direction: Direction }[] = [];

    const maxAttempts = state.blocks.length * 300;
    let attempts = 0;

    while (reverseSlots.length < state.blocks.length && attempts < maxAttempts) {
      attempts++;
      const row = Math.floor(Math.random() * state.rows);
      const column = Math.floor(Math.random() * state.columns);
      const key = this.key(row, column);
      if (occupied.has(key)) continue;

      const direction = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
      const path = this.pathToEdge(row, column, direction, state.rows, state.columns);
      if (path.length === 0) continue;
      if (path.some((c) => occupied.has(this.key(c.row, c.column)))) continue;

      occupied.add(key);
      reverseSlots.push({ row, column, direction });
    }

    if (reverseSlots.length < state.blocks.length) return null;

    const escapeOrder = [...reverseSlots].reverse();
    return escapeOrder.map((slot, index) => ({
      id: state.blocks[index].id,
      row: slot.row,
      column: slot.column,
      direction: slot.direction,
      color: colors[index],
      type: 'ARROW' as const,
    }));
  }

  private pathToEdge(row: number, column: number, direction: Direction, rows: number, columns: number) {
    const path: { row: number; column: number }[] = [];
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

  private key(row: number, column: number): string {
    return `${row}:${column}`;
  }
}
