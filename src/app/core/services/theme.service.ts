import { Injectable, inject, signal } from '@angular/core';
import { ThemeDefinition } from './config.service';
import { ConfigService } from './config.service';
import { StorageService } from './storage.service';
import { CoinService } from './coin.service';

const SELECTED_THEME_KEY = 'arrow_rush.selected_theme';
const UNLOCKED_THEMES_KEY = 'arrow_rush.unlocked_themes';

/** Board/UI theme selection and coin-gated unlocks. Applies a `theme-<id>` class to
 * <body>, which the SCSS in src/theme drives via CSS custom properties. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly config = inject(ConfigService);
  private readonly storage = inject(StorageService);
  private readonly coins = inject(CoinService);

  private readonly _selectedThemeId = signal('classic');
  private readonly _unlockedThemeIds = signal<string[]>(['classic']);
  readonly selectedThemeId = this._selectedThemeId.asReadonly();
  readonly unlockedThemeIds = this._unlockedThemeIds.asReadonly();

  private themes: ThemeDefinition[] = [];
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const [themeConfig, storedSelected, storedUnlocked] = await Promise.all([
        this.config.getThemeConfig(),
        this.storage.get<string>(SELECTED_THEME_KEY),
        this.storage.get<string[]>(UNLOCKED_THEMES_KEY),
      ]);

      this.themes = themeConfig.themes;
      this._unlockedThemeIds.set(storedUnlocked ?? ['classic']);
      this._selectedThemeId.set(storedSelected ?? 'classic');
      this.applyThemeClass(this._selectedThemeId());
      this.initialized = true;
    })();

    return this.initPromise;
  }

  getThemes(): ThemeDefinition[] {
    return this.themes;
  }

  isUnlocked(themeId: string): boolean {
    return this._unlockedThemeIds().includes(themeId);
  }

  async select(themeId: string): Promise<void> {
    await this.init();
    if (!this.isUnlocked(themeId)) return;

    this._selectedThemeId.set(themeId);
    this.applyThemeClass(themeId);
    await this.storage.set(SELECTED_THEME_KEY, themeId);
  }

  async purchase(themeId: string): Promise<boolean> {
    await this.init();
    if (this.isUnlocked(themeId)) return true;

    const theme = this.themes.find((t) => t.id === themeId);
    if (!theme) return false;

    const spent = await this.coins.spendCoins(theme.cost, 'THEME_PURCHASE', themeId);
    if (!spent) return false;

    const next = [...this._unlockedThemeIds(), themeId];
    this._unlockedThemeIds.set(next);
    await this.storage.set(UNLOCKED_THEMES_KEY, next);
    return true;
  }

  private applyThemeClass(themeId: string): void {
    if (typeof document === 'undefined') return;
    const body = document.body;
    for (const theme of this.themes) {
      body.classList.remove(`theme-${theme.id}`);
    }
    body.classList.add(`theme-${themeId}`);
  }
}
