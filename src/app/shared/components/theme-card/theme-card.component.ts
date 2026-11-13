import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ThemeDefinition } from '../../../core/services/config.service';
import { CoinIconComponent } from '../coin-icon/coin-icon.component';

@Component({
  selector: 'app-theme-card',
  templateUrl: './theme-card.component.html',
  styleUrls: ['./theme-card.component.scss'],
  standalone: true,
  imports: [DecimalPipe, CoinIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeCardComponent {
  @Input({ required: true }) theme!: ThemeDefinition;
  @Input() isUnlocked = false;
  @Input() isSelected = false;
  @Output() choose = new EventEmitter<ThemeDefinition>();
}
