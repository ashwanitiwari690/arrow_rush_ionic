import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { ArrowBlock, Direction } from '../../../core/models/game.models';

const DIRECTION_ICON: Record<Direction, string> = {
  UP: 'arrow-up',
  DOWN: 'arrow-down',
  LEFT: 'arrow-back',
  RIGHT: 'arrow-forward',
};

@Component({
  selector: 'app-arrow-block',
  templateUrl: './arrow-block.component.html',
  styleUrls: ['./arrow-block.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArrowBlockComponent {
  @Input({ required: true }) block!: ArrowBlock;
  @Input() isShaking = false;
  @Input() isHinted = false;
  @Input() isEscaping = false;
  @Output() tap = new EventEmitter<string>();

  get icon(): string {
    return DIRECTION_ICON[this.block.direction];
  }

  get escapeClass(): string {
    return this.isEscaping ? `escaping-${this.block.direction.toLowerCase()}` : '';
  }
}
