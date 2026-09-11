import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { IonicModule } from '@ionic/angular/lazy';

import { ThemesPageRoutingModule } from './themes-routing.module';
import { SharedModule } from '../../../shared/shared.module';

import { ThemesPage } from './themes.page';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    SharedModule,
    ThemesPageRoutingModule
  ],
  declarations: [ThemesPage]
})
export class ThemesPageModule {}
