import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { Obstacle } from '../../../core/models/game.models';

@Component({
  selector: 'app-obstacle-tile',
  templateUrl: './obstacle-tile.component.html',
  styleUrls: ['./obstacle-tile.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ObstacleTileComponent {
  @Input({ required: true }) obstacle!: Obstacle;
}
