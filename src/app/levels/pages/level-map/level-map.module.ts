import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { IonicModule } from '@ionic/angular/lazy';

import { LevelMapPageRoutingModule } from './level-map-routing.module';
import { SharedModule } from '../../../shared/shared.module';

import { LevelMapPage } from './level-map.page';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    SharedModule,
    LevelMapPageRoutingModule
  ],
  declarations: [LevelMapPage]
})
export class LevelMapPageModule {}
