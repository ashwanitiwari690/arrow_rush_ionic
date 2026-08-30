import { Injectable, inject, signal } from '@angular/core';
import { StorageService } from './storage.service';

export type AppLanguage = 'en' | 'hi';

export interface AppSettings {
  soundEnabled: boolean;
  musicEnabled: boolean;
  vibrationEnabled: boolean;
  notificationsEnabled: boolean;
  language: AppLanguage;
}

const SETTINGS_KEY = 'arrow_rush.settings';

const DEFAULT_SETTINGS: AppSettings = {
  soundEnabled: true,
  musicEnabled: true,
  vibrationEnabled: true,
  notificationsEnabled: true,
  language: 'en',
};

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly storage = inject(StorageService);

  private readonly _settings = signal<AppSettings>(DEFAULT_SETTINGS);
  readonly settings = this._settings.asReadonly();

  private initialized = false;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const stored = await this.storage.get<AppSettings>(SETTINGS_KEY);
      this._settings.set({ ...DEFAULT_SETTINGS, ...stored });
      this.initialized = true;
    })();

    return this.initPromise;
  }

  async update(partial: Partial<AppSettings>): Promise<void> {
    await this.init();
    const next = { ...this._settings(), ...partial };
    this._settings.set(next);
    await this.storage.set(SETTINGS_KEY, next);
  }
}
