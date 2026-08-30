import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: 'home',
    loadChildren: () => import('./home/home.module').then( m => m.HomePageModule)
  },
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full'
  },
  {
    path: 'level-map',
    loadChildren: () => import('./levels/pages/level-map/level-map.module').then( m => m.LevelMapPageModule)
  },
  {
    path: 'game-play/:levelId',
    loadChildren: () => import('./game/pages/game-play/game-play.module').then( m => m.GamePlayPageModule)
  },
  {
    path: 'store',
    loadChildren: () => import('./store/pages/store/store.module').then( m => m.StorePageModule)
  },
  {
    path: 'profile',
    loadChildren: () => import('./profile/pages/profile/profile.module').then( m => m.ProfilePageModule)
  },
  {
    path: 'settings',
    loadChildren: () => import('./settings/pages/settings/settings.module').then( m => m.SettingsPageModule)
  },
  {
    path: 'daily-challenge',
    loadChildren: () => import('./daily-challenge/pages/daily-challenge/daily-challenge.module').then( m => m.DailyChallengePageModule)
  },
  {
    path: 'themes',
    loadChildren: () => import('./themes/pages/themes/themes.module').then( m => m.ThemesPageModule)
  },
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule { }
