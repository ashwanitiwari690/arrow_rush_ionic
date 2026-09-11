import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { AdService } from '../../../core/services/ad.service';
import { environment } from '../../../../environments/environment';

/**
 * Reserved banner slot for non-gameplay screens only (Home, Level Map, Store, Daily
 * Challenge, Profile, Themes — never placed over the board, buttons, timer, or other
 * gameplay info). A real AdMob banner is a native view pinned to the bottom of the whole
 * screen rather than an inline DOM element, so this component's own div only reserves
 * matching scroll space at the bottom of whichever page renders it last in its content;
 * the actual ad is shown/hidden by AdMobService as this component is mounted/destroyed by
 * router navigation. On web (no native AdMob), a labeled placeholder renders instead so the
 * layout is still previewable in the browser. Renders nothing while
 * `features.bannerAdsEnabled` is off.
 */
@Component({
  selector: 'app-ad-banner',
  templateUrl: './ad-banner.component.html',
  styleUrls: ['./ad-banner.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdBannerComponent implements OnInit, OnDestroy {
  private readonly adService = inject(AdService);

  readonly bannerAdsEnabled = environment.features.bannerAdsEnabled;
  readonly isNative = Capacitor.isNativePlatform();

  ngOnInit(): void {
    if (this.bannerAdsEnabled) void this.adService.showBanner();
  }

  ngOnDestroy(): void {
    if (this.bannerAdsEnabled) void this.adService.hideBanner();
  }
}
