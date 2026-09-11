import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-out-of-lives-panel',
  templateUrl: './out-of-lives-panel.component.html',
  styleUrls: ['./out-of-lives-panel.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OutOfLivesPanelComponent {
  @Input() adAvailable = false;
  @Input() isProcessingAd = false;

  @Output() watchAdForLife = new EventEmitter<void>();
  @Output() levelMap = new EventEmitter<void>();
}
