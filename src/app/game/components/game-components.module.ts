import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular/lazy';

import { SharedModule } from '../../shared/shared.module';
import { GameBoardComponent } from './game-board/game-board.component';
import { ArrowBlockComponent } from './arrow-block/arrow-block.component';
import { ObstacleTileComponent } from './obstacle-tile/obstacle-tile.component';
import { GameHeaderComponent } from './game-header/game-header.component';
import { LevelCompletePanelComponent } from './level-complete-panel/level-complete-panel.component';
import { GameOverPanelComponent } from './game-over-panel/game-over-panel.component';
import { PausePanelComponent } from './pause-panel/pause-panel.component';
import { OutOfLivesPanelComponent } from './out-of-lives-panel/out-of-lives-panel.component';

const COMPONENTS = [
  GameBoardComponent,
  ArrowBlockComponent,
  ObstacleTileComponent,
  GameHeaderComponent,
  LevelCompletePanelComponent,
  GameOverPanelComponent,
  PausePanelComponent,
  OutOfLivesPanelComponent,
];

@NgModule({
  imports: [CommonModule, IonicModule, SharedModule],
  declarations: COMPONENTS,
  exports: COMPONENTS,
})
export class GameComponentsModule {}
