import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { ArrowBlock, GameState } from '../../../core/models/game.models';

interface Ghost {
  key: string;
  block: ArrowBlock;
}

export interface BlockedFeedback {
  blockId: string;
  ts: number;
}

const ESCAPE_ANIMATION_MS = 300;
const SHAKE_ANIMATION_MS = 400;

/**
 * Purely presentational + interaction surface for the puzzle grid. All game rules live
 * in GameEngineService; this component only renders `state` and reports taps, plus runs
 * the short-lived "escaping" / "blocked shake" animations by diffing state on each change.
 */
@Component({
  selector: 'app-game-board',
  templateUrl: './game-board.component.html',
  styleUrls: ['./game-board.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameBoardComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) state!: GameState;
  @Input() hintedBlockId: string | null = null;
  @Input() blocked: BlockedFeedback | null = null;

  @Output() blockTap = new EventEmitter<string>();

  private readonly cdr = inject(ChangeDetectorRef);

  cellIndices: number[] = [];
  ghosts: Ghost[] = [];
  shakingBlockId: string | null = null;

  private previousBlocks: ArrowBlock[] = [];
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private cachedGridSize = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['state'] && this.state) {
      this.updateCellIndices();
      this.diffForEscapes();
    }
    if (changes['blocked'] && this.blocked) {
      this.triggerShake(this.blocked.blockId);
    }
  }

  ngOnDestroy(): void {
    for (const timer of this.timers) clearTimeout(timer);
  }

  onTap(blockId: string): void {
    this.blockTap.emit(blockId);
  }

  private updateCellIndices(): void {
    const sizeKey = `${this.state.rows}x${this.state.columns}`;
    if (this.cachedGridSize !== sizeKey) {
      this.cachedGridSize = sizeKey;
      const count = this.state.rows * this.state.columns;
      this.cellIndices = Array.from({ length: count }, (_, i) => i);
    }
  }

  private diffForEscapes(): void {
    const currentIds = new Set(this.state.blocks.map((b) => b.id));
    const removed = this.previousBlocks.filter((b) => !currentIds.has(b.id));

    for (const block of removed) {
      const key = `${block.id}-${Date.now()}`;
      this.ghosts = [...this.ghosts, { key, block }];
      const timer = setTimeout(() => {
        this.ghosts = this.ghosts.filter((g) => g.key !== key);
        this.timers.delete(timer);
        this.cdr.markForCheck();
      }, ESCAPE_ANIMATION_MS);
      this.timers.add(timer);
    }

    this.previousBlocks = this.state.blocks;
    this.cdr.markForCheck();
  }

  private triggerShake(blockId: string): void {
    this.shakingBlockId = blockId;
    this.cdr.markForCheck();
    const timer = setTimeout(() => {
      if (this.shakingBlockId === blockId) {
        this.shakingBlockId = null;
        this.cdr.markForCheck();
      }
      this.timers.delete(timer);
    }, SHAKE_ANIMATION_MS);
    this.timers.add(timer);
  }
}
