import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { AlertController } from '@ionic/angular/alert-controller';
import { ToastController } from '@ionic/angular/toast-controller';
import { App } from '@capacitor/app';
import { SettingsService } from '../../../core/services/settings.service';
import { SoundService } from '../../../core/services/sound.service';
import { MusicService } from '../../../core/services/music.service';
import { AdService } from '../../../core/services/ad.service';
import { LevelService } from '../../../core/services/level.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPage implements OnInit {
  private readonly settingsService = inject(SettingsService);
  private readonly sound = inject(SoundService);
  private readonly music = inject(MusicService);
  private readonly ads = inject(AdService);
  private readonly levelService = inject(LevelService);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);

  readonly settings = this.settingsService.settings;
  readonly appVersion = signal<string>(environment.appVersion ?? '1.0.0');
  readonly privacyOptionsRequired = this.ads.privacyOptionsRequired;
  readonly openingPrivacyOptions = signal(false);

  async ngOnInit(): Promise<void> {
    await this.settingsService.init();
    await this.loadAppVersion();
  }

  private async loadAppVersion(): Promise<void> {
    try {
      const info = await App.getInfo();
      if (info?.version) {
        this.appVersion.set(info.version);
      }
    } catch {
      // Running on web or plugin unavailable
    }
  }

  toggle(key: 'soundEnabled' | 'musicEnabled' | 'vibrationEnabled' | 'notificationsEnabled'): void {
    void this.settingsService.update({ [key]: !this.settings()[key] });
  }

  setVolume(key: 'soundVolume' | 'musicVolume', event: Event): void {
    const value = Number((event.target as HTMLInputElement).value) / 100;
    void this.settingsService.update({ [key]: value });
  }

  previewSound(): void {
    this.music.unlock();
    this.sound.play('levelComplete');
  }

  async openAdPrivacyOptions(): Promise<void> {
    if (this.openingPrivacyOptions()) return;
    this.openingPrivacyOptions.set(true);
    try {
      if (!await this.ads.showPrivacyOptions()) {
        const toast = await this.toastController.create({ message: 'Privacy options are not available right now. Please try again later.', duration: 2500 });
        await toast.present();
      }
    } finally { this.openingPrivacyOptions.set(false); }
  }

  async confirmResetLevels(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Reset Levels?',
      subHeader: 'Progress will be reset to Level 1',
      message: 'Are you sure you want to reset your level progress? All completed levels and stars will be cleared. Your coins will NOT be affected.',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Reset',
          role: 'destructive',
          handler: () => {
            void this.resetLevels();
          },
        },
      ],
    });

    await alert.present();
  }

  async resetLevels(): Promise<void> {
    await this.levelService.resetProgress();
    const toast = await this.toastController.create({
      message: 'Level progress has been reset to Level 1.',
      duration: 2000,
      position: 'bottom',
      color: 'success',
    });
    await toast.present();
  }
}
