import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';
import { HttpClientModule } from '@angular/common/http';

import { IonicModule, IonicRouteStrategy } from '@ionic/angular/lazy';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { AdService } from './core/services/ad.service';
import { AdMobService } from './core/services/admob.service';
import { GameRewardApiService } from './core/services/game-reward-api.service';
import { LocalGameRewardApiService } from './core/services/local-game-reward-api.service';

@NgModule({
  declarations: [AppComponent],
  imports: [BrowserModule, HttpClientModule, IonicModule.forRoot(), AppRoutingModule],
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    // Single swap point for the ad SDK / a real reward backend later on. AdMobService itself
    // falls back to MockAdService's behavior in a desktop browser (see admob.service.ts).
    { provide: AdService, useClass: AdMobService },
    { provide: GameRewardApiService, useClass: LocalGameRewardApiService },
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
