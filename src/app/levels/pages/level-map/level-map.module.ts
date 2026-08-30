import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular/lazy';

import { LevelMapPageRoutingModule } from './level-map-routing.module';
import { SharedModule } from '../../../shared/shared.module';

import { LevelMapPage } from './level-map.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SharedModule,
    LevelMapPageRoutingModule
  ],
  declarations: [LevelMapPage]
})
export class LevelMapPageModule {}
