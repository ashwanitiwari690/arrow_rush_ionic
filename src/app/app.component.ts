import { Component, DestroyRef, HostListener, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { ThemeService } from './core/services/theme.service';
import { SettingsService } from './core/services/settings.service';
import { MusicService } from './core/services/music.service';
import { AudioService } from './core/services/audio.service';
import { SoundService } from './core/services/sound.service';
import { AppVerificationService } from './core/services/app-verification.service';
import { AdService } from './core/services/ad.service';
import { ConnectivityService } from './core/services/connectivity.service';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly themeService = inject(ThemeService);
  private readonly settingsService = inject(SettingsService);
  private readonly musicService = inject(MusicService);
  private readonly audio = inject(AudioService);
  private readonly sound = inject(SoundService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly appVerificationService = inject(AppVerificationService);
  private readonly adService = inject(AdService);
  readonly connectivity = inject(ConnectivityService);

  private currentUrl = '/home';

  ngOnInit(): void {
    // The selected theme and app settings must be restored as soon as the app boots,
    // not only when the user happens to visit the Themes/Settings pages — otherwise a
    // previously chosen theme silently reverts to the default on every fresh launch.
    void this.settingsService.init();
    void this.themeService.init();

    // Confirms any pending Earnivo "App Promotion" task for this device. Harmless and
    // idempotent on every launch — see AppVerificationService for why.
    void this.appVerificationService.verifyAppPromotion();

    // Boots the ad SDK and starts preloading interstitial/rewarded ads as early as
    // possible, so they're already loaded by the time a screen wants to show one.
    if (environment.features.adsEnabled) {
      void this.adService.initialize();
    }

    this.adService.setScreen(this.router.url);
    this.router.events.pipe(filter((event) => event instanceof NavigationStart), takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.adService.setScreen('');
    });

    this.router.events.pipe(filter((event) => event instanceof NavigationEnd), takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      this.currentUrl = (event as NavigationEnd).urlAfterRedirects;
      this.adService.setScreen(this.currentUrl);
      // Gameplay owns its soundtrack so returning to a paused level stays silent.
      if (!this.currentUrl.startsWith('/game-play')) this.musicService.start('menu');
    });

    if (Capacitor.isNativePlatform()) {
      // Android hardware back button: same "always returns toward Home" model as the
      // in-app Home/Exit buttons, and exits the app once already there — the standard
      // expected behavior for an Android game rather than silently doing nothing.
      const backListener = App.addListener('backButton', () => {
        if (this.adService.fullScreenShowing()) return;
        if (this.currentUrl === '/home') {
          void App.exitApp();
        } else {
          void this.router.navigateByUrl('/home');
        }
      });
      const stateListener = App.addListener('appStateChange', ({ isActive }) => this.audio.setAppActive(isActive));
      this.destroyRef.onDestroy(() => {
        void backListener.then((listener) => listener.remove());
        void stateListener.then((listener) => listener.remove());
      });
    }
  }

  @HostListener('document:pointerdown')
  @HostListener('document:keydown')
  onFirstUserGesture(): void {
    this.musicService.unlock();
  }

  @HostListener('document:click', ['$event'])
  onInterfaceClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest('button, ion-button');
    if (!button || button.closest('app-arrow-block, app-power-up-button') || button.hasAttribute('disabled')) return;
    this.sound.play('buttonClick');
  }

  onTryAgain(): void {
    this.connectivity.recheck();
  }
}
