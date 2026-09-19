import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular/lazy';
import { InfoPageRoutingModule } from './info-routing.module';
import { InfoPage } from './info.page';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    InfoPageRoutingModule,
  ],
  declarations: [InfoPage],
})
export class InfoPageModule {}

