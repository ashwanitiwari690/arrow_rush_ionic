import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent } from '@ionic/angular/ion-content';
import { IonIcon } from '@ionic/angular/ion-icon';
import { HomePage } from './home.page';

import { HomePageRoutingModule } from './home-routing.module';
import { CoinBalanceComponent } from '../shared/components/coin-balance/coin-balance.component';


@NgModule({
  imports: [
    CommonModule,
    IonContent, IonIcon,
    CoinBalanceComponent,
    HomePageRoutingModule
  ],
  declarations: [HomePage]
})
export class HomePageModule {}
