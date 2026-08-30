import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular/lazy';

import { SharedModule } from '../../shared/shared.module';
import { GameBoardComponent } from './game-board/game-board.component';
import { ArrowBlockComponent } from './arrow-block/arrow-block.component';
import { ObstacleTileComponent } from './obstacle-tile/obstacle-tile.component';
import { GameHeaderComponent } from './game-header/game-header.component';
import { LevelCompletePanelComponent } from './level-complete-panel/level-complete-panel.component';
import { GameOverPanelComponent } from './game-over-panel/game-over-panel.component';
import { PausePanelComponent } from './pause-panel/pause-panel.component';

const COMPONENTS = [
  GameBoardComponent,
  ArrowBlockComponent,
  ObstacleTileComponent,
  GameHeaderComponent,
  LevelCompletePanelComponent,
  GameOverPanelComponent,
  PausePanelComponent,
];

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, SharedModule],
  declarations: COMPONENTS,
  exports: COMPONENTS,
})
export class GameComponentsModule {}
