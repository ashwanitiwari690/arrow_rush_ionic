import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';
import { HttpClientModule } from '@angular/common/http';

import { IonicRouteStrategy } from '@ionic/angular/common';
import { provideIonicAngular } from '@ionic/angular/provide';
import { IonApp } from '@ionic/angular/ion-app';
import { IonIcon } from '@ionic/angular/ion-icon';
import { IonRouterOutlet } from '@ionic/angular/ion-router-outlet';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { AdBannerComponent } from './shared/components/ad-banner/ad-banner.component';
import { AdService } from './core/services/ad.service';
import { AdMobService } from './core/services/admob.service';
import { GameRewardApiService } from './core/services/game-reward-api.service';
import { LocalGameRewardApiService } from './core/services/local-game-reward-api.service';

@NgModule({
  declarations: [AppComponent],
  imports: [BrowserModule, HttpClientModule, IonApp, IonIcon, IonRouterOutlet, AppRoutingModule, AdBannerComponent],
  providers: [
    provideIonicAngular(),
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    // Single swap point for the ad SDK / a real reward backend later on. AdMobService itself
    // falls back to MockAdService's behavior in a desktop browser (see admob.service.ts).
    { provide: AdService, useClass: AdMobService },
    { provide: GameRewardApiService, useClass: LocalGameRewardApiService },
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
