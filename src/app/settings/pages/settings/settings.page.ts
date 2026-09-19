import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular/lazy';
import { App } from '@capacitor/app';
import { SettingsService, AppLanguage } from '../../../core/services/settings.service';
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
  private readonly levelService = inject(LevelService);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);

  readonly settings = this.settingsService.settings;
  readonly appVersion = signal<string>(environment.appVersion ?? '1.0.0');

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

  setLanguage(language: string | number | undefined): void {
    if (language !== 'en' && language !== 'hi') return;
    void this.settingsService.update({ language: language as AppLanguage });
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
