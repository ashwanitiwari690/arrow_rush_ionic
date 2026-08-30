import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular/lazy';

import { StorePageRoutingModule } from './store-routing.module';
import { SharedModule } from '../../../shared/shared.module';

import { StorePage } from './store.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SharedModule,
    StorePageRoutingModule
  ],
  declarations: [StorePage]
})
export class StorePageModule {}
