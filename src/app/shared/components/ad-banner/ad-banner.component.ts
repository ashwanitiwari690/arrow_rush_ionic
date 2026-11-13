import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { AdService } from '../../../core/services/ad.service';

/** One reserved footer outside the router outlet, never over scrollable game controls. */
@Component({
  selector: 'app-ad-banner',
  templateUrl: './ad-banner.component.html',
  styleUrls: ['./ad-banner.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdBannerComponent {
  readonly height = inject(AdService).bannerHeight;
  readonly isNative = Capacitor.isNativePlatform();
}
