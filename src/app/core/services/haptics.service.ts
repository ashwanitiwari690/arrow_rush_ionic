import { Injectable, inject } from '@angular/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { SettingsService } from './settings.service';

@Injectable({ providedIn: 'root' })
export class HapticsService {
  private readonly settingsService = inject(SettingsService);

  async impact(style: ImpactStyle = ImpactStyle.Light): Promise<void> {
    if (!this.settingsService.settings().vibrationEnabled) return;
    try {
      await Haptics.impact({ style });
    } catch {
      // Not available on this platform (e.g. desktop web) — safe to ignore.
    }
  }
}
