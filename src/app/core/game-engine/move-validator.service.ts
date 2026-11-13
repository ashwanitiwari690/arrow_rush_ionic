import { Injectable } from '@angular/core';
import { ArrowBlock, Cell, Direction, GameState } from '../models/game.models';

/**
 * Pure collision/path logic for the escape-the-blocks rule: a block may leave the board
 * only if every cell between it and the edge, in its own direction, is empty.
 */
@Injectable({ providedIn: 'root' })
export class MoveValidatorService {
  /** Cells strictly between the block and the board edge, in travel order, edge-first is last. */
  calculatePath(state: GameState, block: ArrowBlock): Cell[] {
    const path: Cell[] = [];
    const { row, column } = block;

    switch (block.direction) {
      case 'UP':
        for (let r = row - 1; r >= 0; r--) path.push({ row: r, column });
        break;
      case 'DOWN':
        for (let r = row + 1; r < state.rows; r++) path.push({ row: r, column });
        break;
      case 'LEFT':
        for (let c = column - 1; c >= 0; c--) path.push({ row, column: c });
        break;
      case 'RIGHT':
        for (let c = column + 1; c < state.columns; c++) path.push({ row, column: c });
        break;
    }

    return path;
  }

  /** Whether the path is clear of every occupied cell (blocks not yet escaped + obstacles). */
  canMove(state: GameState, blockId: string): boolean {
    const block = state.blocks.find((b) => b.id === blockId);
    if (!block) return false;

    return this.canMoveWithOccupied(state, block, this.getOccupiedCellSet(state));
  }

  canMoveWithOccupied(state: GameState, block: Pick<ArrowBlock, 'row' | 'column' | 'direction'>, occupied: Set<string>): boolean {
    // Scan directly: hints and dead-end checks don't need an allocated Cell[] per arrow.
    const delta = this.directionDelta(block.direction);
    let row = block.row + delta.row;
    let column = block.column + delta.column;
    while (row >= 0 && row < state.rows && column >= 0 && column < state.columns) {
      if (occupied.has(`${row}:${column}`)) return false;
      row += delta.row;
      column += delta.column;
    }
    return true;
  }

  isPathClear(path: Cell[], occupied: Set<string>): boolean {
    return path.every((cell) => !occupied.has(this.cellKey(cell)));
  }

  getOccupiedCellSet(state: GameState): Set<string> {
    const occupied = new Set<string>();
    for (const b of state.blocks) {
      occupied.add(this.cellKey(b));
    }
    for (const o of state.obstacles) {
      occupied.add(this.cellKey(o));
    }
    return occupied;
  }

  private cellKey(cell: Cell): string {
    return `${cell.row}:${cell.column}`;
  }

  directionDelta(direction: Direction): Cell {
    switch (direction) {
      case 'UP':
        return { row: -1, column: 0 };
      case 'DOWN':
        return { row: 1, column: 0 };
      case 'LEFT':
        return { row: 0, column: -1 };
      case 'RIGHT':
        return { row: 0, column: 1 };
    }
  }
}
