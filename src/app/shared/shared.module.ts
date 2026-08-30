import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular/lazy';

import { CoinBalanceComponent } from './components/coin-balance/coin-balance.component';
import { LevelCardComponent } from './components/level-card/level-card.component';
import { ThemeCardComponent } from './components/theme-card/theme-card.component';
import { ConfirmDialogComponent } from './components/confirm-dialog/confirm-dialog.component';
import { AdBannerComponent } from './components/ad-banner/ad-banner.component';
import { PowerUpButtonComponent } from './components/power-up-button/power-up-button.component';
import { CoinIconComponent } from './components/coin-icon/coin-icon.component';

const COMPONENTS = [
  CoinBalanceComponent,
  LevelCardComponent,
  ThemeCardComponent,
  ConfirmDialogComponent,
  AdBannerComponent,
  PowerUpButtonComponent,
  CoinIconComponent,
];

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule],
  declarations: COMPONENTS,
  exports: COMPONENTS,
})
export class SharedModule {}
