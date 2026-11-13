import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { IonButton } from '@ionic/angular/ion-button';
import { IonContent } from '@ionic/angular/ion-content';
import { IonIcon } from '@ionic/angular/ion-icon';
import { IonSpinner } from '@ionic/angular/ion-spinner';

import { GamePlayPageRoutingModule } from './game-play-routing.module';
import { GameComponentsModule } from '../../components/game-components.module';
import { PowerUpButtonComponent } from '../../../shared/components/power-up-button/power-up-button.component';

import { GamePlayPage } from './game-play.page';

@NgModule({
  imports: [
    CommonModule,
    IonButton, IonContent, IonIcon, IonSpinner,
    GameComponentsModule,
    PowerUpButtonComponent,
    GamePlayPageRoutingModule
  ],
  declarations: [GamePlayPage]
})
export class GamePlayPageModule {}
