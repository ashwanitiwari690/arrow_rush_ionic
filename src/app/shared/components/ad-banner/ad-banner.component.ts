import { ChangeDetectionStrategy, Component } from '@angular/core';
import { environment } from '../../../../environments/environment';

/**
 * Reserved slot for a banner ad on non-gameplay screens only (Home, Level Map, Store —
 * never placed over the board, buttons, timer, or other gameplay info). Renders nothing
 * while `features.bannerAdsEnabled` is off, which is the default in every environment
 * until a real AdMob banner is wired into AdService.
 */
@Component({
  selector: 'app-ad-banner',
  templateUrl: './ad-banner.component.html',
  styleUrls: ['./ad-banner.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdBannerComponent {
  readonly bannerAdsEnabled = environment.features.bannerAdsEnabled;
}
