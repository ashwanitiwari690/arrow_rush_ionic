import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

/**
 * Single seam for all persistence. Wraps @capacitor/preferences (localStorage-backed on
 * web, native prefs on device) so no other file in the app touches localStorage directly.
 */
@Injectable({ providedIn: 'root' })
export class StorageService {
  async get<T>(key: string): Promise<T | null> {
    const { value } = await Preferences.get({ key });
    if (value === null || value === undefined) {
      return null;
    }
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    await Preferences.set({ key, value: JSON.stringify(value) });
  }

  async remove(key: string): Promise<void> {
    await Preferences.remove({ key });
  }

  async clear(): Promise<void> {
    await Preferences.clear();
  }
}
