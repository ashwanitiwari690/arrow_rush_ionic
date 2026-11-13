import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { IonBackButton } from '@ionic/angular/ion-back-button';
import { IonButton } from '@ionic/angular/ion-button';
import { IonButtons } from '@ionic/angular/ion-buttons';
import { IonContent } from '@ionic/angular/ion-content';
import { IonHeader } from '@ionic/angular/ion-header';
import { IonIcon } from '@ionic/angular/ion-icon';
import { IonTitle } from '@ionic/angular/ion-title';
import { IonToolbar } from '@ionic/angular/ion-toolbar';

import { StorePageRoutingModule } from './store-routing.module';
import { CoinBalanceComponent } from '../../../shared/components/coin-balance/coin-balance.component';
import { CoinIconComponent } from '../../../shared/components/coin-icon/coin-icon.component';

import { StorePage } from './store.page';

@NgModule({
  imports: [
    CommonModule,
    IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar,
    CoinBalanceComponent,
    CoinIconComponent,
    StorePageRoutingModule
  ],
  declarations: [StorePage]
})
export class StorePageModule {}
