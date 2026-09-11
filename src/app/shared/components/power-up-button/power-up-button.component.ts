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
  /** When true, tapping this button at count 0 offers a rewarded ad for +1 use instead of
   * being disabled outright — see GamePlayPage.onPowerUp(). */
  @Input() adAvailable = false;
  @Input() isLoadingAd = false;
  @Output() activate = new EventEmitter<void>();

  get isEmpty(): boolean {
    return this.count <= 0;
  }

  get isDisabled(): boolean {
    if (this.isLoadingAd) return true;
    return this.isEmpty && !this.adAvailable;
  }

  get offersAd(): boolean {
    return this.isEmpty && this.adAvailable;
  }
}
