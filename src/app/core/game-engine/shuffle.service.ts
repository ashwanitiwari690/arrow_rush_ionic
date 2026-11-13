import { Injectable, inject } from '@angular/core';
import { ArrowBlock, Direction, GameState } from '../models/game.models';
import { MoveValidatorService } from './move-validator.service';

const DIRECTIONS: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

/**
 * Re-lays-out the blocks still on the board (obstacles and escaped blocks are
 * untouched) using the same reverse-construction technique as the level generator
 * (see scripts/generate-levels.mjs), so the shuffled layout is guaranteed solvable —
 * shuffle can never hand the player a soft-locked board.
 */
@Injectable({ providedIn: 'root' })
export class ShuffleService {
  private readonly validator = inject(MoveValidatorService);

  shuffle(state: GameState): ArrowBlock[] | null {
    const occupied = new Set<string>();
    for (const o of state.obstacles) occupied.add(this.key(o.row, o.column));

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
      const distance = direction === 'UP' ? row : direction === 'DOWN' ? state.rows - row - 1
        : direction === 'LEFT' ? column : state.columns - column - 1;
      if (distance === 0 || !this.validator.canMoveWithOccupied(state, { row, column, direction }, occupied)) continue;

      occupied.add(key);
      reverseSlots.push({ row, column, direction });
    }

    if (reverseSlots.length < state.blocks.length) return null;

    const escapeOrder = reverseSlots.reverse();
    return escapeOrder.map((slot, index) => ({
      id: state.blocks[index].id,
      row: slot.row,
      column: slot.column,
      direction: slot.direction,
      color: state.blocks[index].color,
      type: 'ARROW' as const,
    }));
  }

  private key(row: number, column: number): string {
    return `${row}:${column}`;
  }
}
