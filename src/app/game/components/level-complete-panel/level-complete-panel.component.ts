import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-level-complete-panel',
  templateUrl: './level-complete-panel.component.html',
  styleUrls: ['./level-complete-panel.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LevelCompletePanelComponent {
  @Input() score = 0;
  @Input() coinsEarned = 0;
  @Input() timeSeconds = 0;
  @Input() stars = 0;
  @Input() hasNextLevel = true;

  @Output() nextLevel = new EventEmitter<void>();
  @Output() replay = new EventEmitter<void>();
  @Output() levelMap = new EventEmitter<void>();

  get formattedTime(): string {
    const minutes = Math.floor(this.timeSeconds / 60);
    const seconds = this.timeSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  get starArray(): boolean[] {
    return [1, 2, 3].map((n) => n <= this.stars);
  }
}
