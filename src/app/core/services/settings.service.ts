import { Injectable, inject, signal } from '@angular/core';
import { StorageService } from './storage.service';

export type AppLanguage = 'en' | 'hi';

export interface AppSettings {
  soundEnabled: boolean;
  musicEnabled: boolean;
  soundVolume: number;
  musicVolume: number;
  vibrationEnabled: boolean;
  notificationsEnabled: boolean;
  language: AppLanguage;
}

const SETTINGS_KEY = 'arrow_rush.settings';

const DEFAULT_SETTINGS: AppSettings = {
  soundEnabled: true,
  musicEnabled: true,
  soundVolume: 0.7,
  musicVolume: 0.35,
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
      this._settings.set(this.normalize({ ...DEFAULT_SETTINGS, ...stored }));
      this.initialized = true;
    })();

    return this.initPromise;
  }

  async update(partial: Partial<AppSettings>): Promise<void> {
    await this.init();
    const next = this.normalize({ ...this._settings(), ...partial });
    this._settings.set(next);
    await this.storage.set(SETTINGS_KEY, next);
  }

  private normalize(settings: AppSettings): AppSettings {
    const volume = (value: number, fallback: number) =>
      typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
    return {
      ...settings,
      soundVolume: volume(settings.soundVolume, DEFAULT_SETTINGS.soundVolume),
      musicVolume: volume(settings.musicVolume, DEFAULT_SETTINGS.musicVolume),
    };
  }
}
