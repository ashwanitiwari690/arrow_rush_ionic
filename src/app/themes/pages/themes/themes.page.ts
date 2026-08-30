import { Component, OnInit, inject, signal } from '@angular/core';
import { ThemeDefinition } from '../../../core/services/config.service';
import { ThemeService } from '../../../core/services/theme.service';
import { CoinService } from '../../../core/services/coin.service';

@Component({
  selector: 'app-themes',
  templateUrl: './themes.page.html',
  styleUrls: ['./themes.page.scss'],
  standalone: false,
})
export class ThemesPage implements OnInit {
  private readonly themeService = inject(ThemeService);
  private readonly coinService = inject(CoinService);

  readonly themes = signal<ThemeDefinition[]>([]);
  readonly selectedThemeId = this.themeService.selectedThemeId;
  readonly unlockedThemeIds = this.themeService.unlockedThemeIds;
  readonly balance = this.coinService.balance;
  readonly insufficientFundsFor = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await Promise.all([this.themeService.init(), this.coinService.init()]);
    this.themes.set(this.themeService.getThemes());
  }

  isUnlocked(themeId: string): boolean {
    return this.themeService.isUnlocked(themeId);
  }

  async choose(theme: ThemeDefinition): Promise<void> {
    this.insufficientFundsFor.set(null);

    if (this.isUnlocked(theme.id)) {
      await this.themeService.select(theme.id);
      return;
    }

    const purchased = await this.themeService.purchase(theme.id);
    if (purchased) {
      await this.themeService.select(theme.id);
    } else {
      this.insufficientFundsFor.set(theme.id);
    }
  }
}
