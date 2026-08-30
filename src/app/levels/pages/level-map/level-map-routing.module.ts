import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { LevelMapPage } from './level-map.page';

const routes: Routes = [
  {
    path: '',
    component: LevelMapPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class LevelMapPageRoutingModule {}
