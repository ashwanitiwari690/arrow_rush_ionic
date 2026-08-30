import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

export type PowerUpAccent = 'hint' | 'undo' | 'shuffle' | 'extra';

@Component({
  selector: 'app-power-up-button',
  templateUrl: './power-up-button.component.html',
  styleUrls: ['./power-up-button.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PowerUpButtonComponent {
  @Input({ required: true }) icon!: string;
  @Input({ required: true }) label!: string;
  @Input({ required: true }) accent!: PowerUpAccent;
  @Input() count = 0;
  @Input() active = false;
  @Output() activate = new EventEmitter<void>();

  get isDisabled(): boolean {
    return this.count <= 0;
  }
}
