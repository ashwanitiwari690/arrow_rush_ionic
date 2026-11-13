import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { IonBackButton } from '@ionic/angular/ion-back-button';
import { IonButtons } from '@ionic/angular/ion-buttons';
import { IonContent } from '@ionic/angular/ion-content';
import { IonHeader } from '@ionic/angular/ion-header';
import { IonTitle } from '@ionic/angular/ion-title';
import { IonToolbar } from '@ionic/angular/ion-toolbar';

import { ThemesPageRoutingModule } from './themes-routing.module';
import { CoinBalanceComponent } from '../../../shared/components/coin-balance/coin-balance.component';
import { ThemeCardComponent } from '../../../shared/components/theme-card/theme-card.component';

import { ThemesPage } from './themes.page';

@NgModule({
  imports: [
    CommonModule,
    IonBackButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar,
    CoinBalanceComponent,
    ThemeCardComponent,
    ThemesPageRoutingModule
  ],
  declarations: [ThemesPage]
})
export class ThemesPageModule {}
