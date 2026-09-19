import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { SettingsPage } from './settings.page';

const routes: Routes = [
  {
    path: '',
    component: SettingsPage,
  },
  {
    path: 'privacy-policy',
    loadChildren: () => import('../info/info.module').then((m) => m.InfoPageModule),
    data: { topic: 'privacy' },
  },
  {
    path: 'terms-of-service',
    loadChildren: () => import('../info/info.module').then((m) => m.InfoPageModule),
    data: { topic: 'terms' },
  },
  {
    path: 'about-arrow-rush',
    loadChildren: () => import('../info/info.module').then((m) => m.InfoPageModule),
    data: { topic: 'about' },
  },
  {
    path: 'info/:topic',
    loadChildren: () => import('../info/info.module').then((m) => m.InfoPageModule),
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SettingsPageRoutingModule {}
