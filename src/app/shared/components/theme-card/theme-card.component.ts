import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { ThemeDefinition } from '../../../core/services/config.service';

@Component({
  selector: 'app-theme-card',
  templateUrl: './theme-card.component.html',
  styleUrls: ['./theme-card.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeCardComponent {
  @Input({ required: true }) theme!: ThemeDefinition;
  @Input() isUnlocked = false;
  @Input() isSelected = false;
  @Output() choose = new EventEmitter<ThemeDefinition>();
}
