import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-game-header',
  templateUrl: './game-header.component.html',
  styleUrls: ['./game-header.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameHeaderComponent {
  @Input({ required: true }) levelId!: number;
  @Input() remainingSeconds = 0;
  @Input() lives = 3;
  @Input() maxLives = 3;
  @Output() pauseTap = new EventEmitter<void>();
  @Output() homeTap = new EventEmitter<void>();

  get formattedTime(): string {
    const minutes = Math.floor(this.remainingSeconds / 60);
    const seconds = this.remainingSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  get isLowTime(): boolean {
    return this.remainingSeconds <= 10;
  }

  get heartsArray(): boolean[] {
    return Array.from({ length: this.maxLives }, (_, i) => i < this.lives);
  }
}
