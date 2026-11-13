import { ChangeDetectionStrategy, Component, Injector, OnInit, afterNextRender, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Difficulty, LevelSummary } from '../../../core/models/game.models';
import { LevelService } from '../../../core/services/level.service';
import { CoinService } from '../../../core/services/coin.service';

interface ZoneStyle {
  name: string;
  icon: string;
  /** CSS class selecting the zone's tiling background image (assets/backgrounds/*.svg). */
  backgroundClass: string;
}

interface ZoneGroup {
  difficulty: Difficulty;
  style: ZoneStyle;
  /** Levels in this band, each carrying its position in the full path for row alternation. */
  levels: { level: LevelSummary; globalIndex: number; alignment: string }[];
}

// One scenic "zone" per difficulty band — an actual hand-drawn SVG tile per zone
// (src/assets/backgrounds/*.svg), not a flat CSS color, repeated down the path so the
// whole band reads as forest -> desert -> frost -> volcano scenery.
const ZONE_STYLES: Record<Difficulty, ZoneStyle> = {
  EASY: { name: 'Forest', icon: 'leaf', backgroundClass: 'zone-bg-forest' },
  MEDIUM: { name: 'Desert', icon: 'sunny', backgroundClass: 'zone-bg-desert' },
  HARD: { name: 'Frost', icon: 'snow', backgroundClass: 'zone-bg-frost' },
  EXPERT: { name: 'Volcano', icon: 'flame', backgroundClass: 'zone-bg-volcano' },
  MASTER: { name: 'Void', icon: 'planet', backgroundClass: 'zone-bg-volcano' },
  INSANE: { name: 'Storm', icon: 'thunderstorm', backgroundClass: 'zone-bg-frost' },
};

@Component({
  selector: 'app-level-map',
  templateUrl: './level-map.page.html',
  styleUrls: ['./level-map.page.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LevelMapPage implements OnInit {
  private readonly router = inject(Router);
  private readonly levelService = inject(LevelService);
  private readonly coinService = inject(CoinService);
  private readonly injector = inject(Injector);

  readonly levels = signal<LevelSummary[]>([]);
  readonly progress = this.levelService.progress;
  readonly isLoading = signal(true);
  readonly loadError = signal(false);
  readonly zoneGroups = computed<ZoneGroup[]>(() => this.groupIntoZones(this.levels()));

  async ngOnInit(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(false);
    try {
      await Promise.all([this.levelService.init(), this.coinService.init()]);
      this.levels.set(await this.levelService.getLevelIndex());
      this.jumpToCurrent();
    } catch {
      this.loadError.set(true);
    } finally {
      this.isLoading.set(false);
    }
  }

  ionViewDidEnter(): void { this.jumpToCurrent(); }

  jumpToCurrent(): void {
    afterNextRender(() => {
      document.getElementById('current-node')?.scrollIntoView({ block: 'center', behavior: 'auto' });
    }, { injector: this.injector });
  }

  readonly currentLevelId = computed(() => {
    const progress = this.progress();
    for (const level of this.levels()) {
      if (!progress[level.levelId]?.completed && progress[level.levelId]?.unlocked) {
        return level.levelId;
      }
    }
    return this.levels().at(-1)?.levelId ?? 1;
  });

  onSelectLevel(levelId: number): void {
    if (!this.levelService.isUnlocked(levelId)) return;
    void this.router.navigate(['/game-play', levelId]);
  }

  private groupIntoZones(levels: LevelSummary[]): ZoneGroup[] {
    const groups: ZoneGroup[] = [];

    levels.forEach((level, globalIndex) => {
      const alignment = globalIndex % 4 === 0 ? 'align-left' : globalIndex % 4 === 2 ? 'align-right' : 'align-center';
      const entry = { level, globalIndex, alignment };
      const last = groups[groups.length - 1];
      if (last && last.difficulty === level.difficulty) {
        last.levels.push(entry);
      } else {
        groups.push({
          difficulty: level.difficulty,
          style: ZONE_STYLES[level.difficulty],
          levels: [entry],
        });
      }
    });

    return groups;
  }
}
