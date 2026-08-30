import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { LevelSummary } from '../../../core/models/game.models';
import { LevelProgress } from '../../../core/models/economy.models';

@Component({
  selector: 'app-level-card',
  templateUrl: './level-card.component.html',
  styleUrls: ['./level-card.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LevelCardComponent {
  @Input({ required: true }) level!: LevelSummary;
  @Input() progress: LevelProgress | null | undefined = null;
  @Input() isCurrent = false;
  @Output() levelSelected = new EventEmitter<number>();

  get unlocked(): boolean {
    return this.progress?.unlocked ?? this.level.levelId === 1;
  }

  get completed(): boolean {
    return this.progress?.completed ?? false;
  }

  get stars(): number {
    return this.progress?.stars ?? 0;
  }

  onTap(): void {
    if (this.unlocked) {
      this.levelSelected.emit(this.level.levelId);
    }
  }
}
