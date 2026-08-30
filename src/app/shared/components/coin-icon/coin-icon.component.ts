import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * A drawn gold coin badge — used everywhere the game shows its virtual currency instead
 * of `ion-icon name="logo-bitcoin"` (wrong metaphor: this is an arcade coin, not crypto).
 * Pure inline SVG so it costs nothing over the network and scales crisply at any size;
 * size it from the outside with a font-size or width/height on the host element.
 */
@Component({
  selector: 'app-coin-icon',
  templateUrl: './coin-icon.component.html',
  styleUrls: ['./coin-icon.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CoinIconComponent {}
