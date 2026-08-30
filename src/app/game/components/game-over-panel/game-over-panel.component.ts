import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-game-over-panel',
  templateUrl: './game-over-panel.component.html',
  styleUrls: ['./game-over-panel.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameOverPanelComponent {
  @Input() adAvailable = false;
  @Input() isProcessingAd = false;

  @Output() retry = new EventEmitter<void>();
  @Output() watchAdAndContinue = new EventEmitter<void>();
  @Output() levelMap = new EventEmitter<void>();
}
