import { Component, HostListener, OnInit, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { ThemeService } from './core/services/theme.service';
import { SettingsService } from './core/services/settings.service';
import { MusicService } from './core/services/music.service';

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

  private audioUnlocked = false;
  private currentUrl = '/home';

  ngOnInit(): void {
    // The selected theme and app settings must be restored as soon as the app boots,
    // not only when the user happens to visit the Themes/Settings pages — otherwise a
    // previously chosen theme silently reverts to the default on every fresh launch.
    void this.settingsService.init();
    void this.themeService.init();

    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe((event) => {
      this.currentUrl = (event as NavigationEnd).urlAfterRedirects;
      const track = this.currentUrl.startsWith('/game-play') ? 'gameplay' : 'menu';
      this.musicService.start(track);
    });

    if (Capacitor.isNativePlatform()) {
      // Android hardware back button: same "always returns toward Home" model as the
      // in-app Home/Exit buttons, and exits the app once already there — the standard
      // expected behavior for an Android game rather than silently doing nothing.
      App.addListener('backButton', () => {
        if (this.currentUrl === '/home') {
          void App.exitApp();
        } else {
          void this.router.navigateByUrl('/home');
        }
      });
    }
  }

  @HostListener('document:click')
  @HostListener('document:touchstart')
  onFirstUserGesture(): void {
    if (this.audioUnlocked) return;
    this.audioUnlocked = true;
    this.musicService.unlock();
  }
}
