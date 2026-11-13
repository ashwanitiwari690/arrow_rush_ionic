import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonBackButton } from '@ionic/angular/ion-back-button';
import { IonButtons } from '@ionic/angular/ion-buttons';
import { IonContent } from '@ionic/angular/ion-content';
import { IonHeader } from '@ionic/angular/ion-header';
import { IonIcon } from '@ionic/angular/ion-icon';
import { IonLabel } from '@ionic/angular/ion-label';
import { IonSegment } from '@ionic/angular/ion-segment';
import { IonSegmentButton } from '@ionic/angular/ion-segment-button';
import { IonTitle } from '@ionic/angular/ion-title';
import { IonToolbar } from '@ionic/angular/ion-toolbar';
import { InfoPageRoutingModule } from './info-routing.module';
import { InfoPage } from './info.page';

@NgModule({
  imports: [
    CommonModule,
    IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonLabel, IonSegment, IonSegmentButton, IonTitle, IonToolbar,
    InfoPageRoutingModule,
  ],
  declarations: [InfoPage],
})
export class InfoPageModule {}

