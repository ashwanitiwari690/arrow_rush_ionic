import { ChangeDetectionStrategy, Component, EventEmitter, Output } from '@angular/core';

@Component({
  selector: 'app-pause-panel',
  templateUrl: './pause-panel.component.html',
  styleUrls: ['./pause-panel.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PausePanelComponent {
  @Output() resumeGame = new EventEmitter<void>();
  @Output() restart = new EventEmitter<void>();
  @Output() openSettings = new EventEmitter<void>();
  @Output() exit = new EventEmitter<void>();
}
