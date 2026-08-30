import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular/lazy';

import { GamePlayPageRoutingModule } from './game-play-routing.module';
import { GameComponentsModule } from '../../components/game-components.module';
import { SharedModule } from '../../../shared/shared.module';

import { GamePlayPage } from './game-play.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    GameComponentsModule,
    SharedModule,
    GamePlayPageRoutingModule
  ],
  declarations: [GamePlayPage]
})
export class GamePlayPageModule {}
