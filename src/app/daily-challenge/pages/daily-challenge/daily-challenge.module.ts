import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular/lazy';

import { DailyChallengePageRoutingModule } from './daily-challenge-routing.module';
import { SharedModule } from '../../../shared/shared.module';

import { DailyChallengePage } from './daily-challenge.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SharedModule,
    DailyChallengePageRoutingModule
  ],
  declarations: [DailyChallengePage]
})
export class DailyChallengePageModule {}
