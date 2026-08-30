import { Component, OnInit, inject } from '@angular/core';
import { SettingsService, AppLanguage } from '../../../core/services/settings.service';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  standalone: false,
})
export class SettingsPage implements OnInit {
  private readonly settingsService = inject(SettingsService);
  readonly settings = this.settingsService.settings;

  async ngOnInit(): Promise<void> {
    await this.settingsService.init();
  }

  toggle(key: 'soundEnabled' | 'musicEnabled' | 'vibrationEnabled' | 'notificationsEnabled'): void {
    void this.settingsService.update({ [key]: !this.settings()[key] });
  }

  setLanguage(language: string | number | undefined): void {
    if (language !== 'en' && language !== 'hi') return;
    void this.settingsService.update({ language: language as AppLanguage });
  }
}
