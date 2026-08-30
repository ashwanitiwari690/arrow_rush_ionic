import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PowerUpType } from '../../../core/models/game.models';
import { PowerupService } from '../../../core/services/powerup.service';
import { CoinService } from '../../../core/services/coin.service';
import { ConfigService, PowerUpConfig } from '../../../core/services/config.service';

interface PowerUpStoreItem {
  type: PowerUpType;
  label: string;
  icon: string;
  cost: number;
}

@Component({
  selector: 'app-store',
  templateUrl: './store.page.html',
  styleUrls: ['./store.page.scss'],
  standalone: false,
})
export class StorePage implements OnInit {
  private readonly router = inject(Router);
  private readonly powerupService = inject(PowerupService);
  private readonly coinService = inject(CoinService);
  private readonly config = inject(ConfigService);

  readonly counts = this.powerupService.counts;
  readonly balance = this.coinService.balance;
  readonly items = signal<PowerUpStoreItem[]>([]);
  readonly purchasingType = signal<PowerUpType | null>(null);
  readonly insufficientFundsFor = signal<PowerUpType | null>(null);

  async ngOnInit(): Promise<void> {
    await Promise.all([this.powerupService.init(), this.coinService.init()]);
    const powerUpConfig: PowerUpConfig = await this.config.getPowerUpConfig();

    this.items.set([
      { type: 'HINT', label: 'Hint', icon: 'bulb', cost: powerUpConfig.storeCosts.HINT },
      { type: 'UNDO', label: 'Undo', icon: 'arrow-undo', cost: powerUpConfig.storeCosts.UNDO },
      { type: 'SHUFFLE', label: 'Shuffle', icon: 'shuffle', cost: powerUpConfig.storeCosts.SHUFFLE },
      { type: 'EXTRA', label: 'Extra Time', icon: 'flash', cost: powerUpConfig.storeCosts.EXTRA },
    ]);
  }

  async buy(item: PowerUpStoreItem): Promise<void> {
    if (this.purchasingType()) return; // prevent double-tap purchases
    this.insufficientFundsFor.set(null);
    this.purchasingType.set(item.type);

    const success = await this.powerupService.purchase(item.type, 1);
    this.purchasingType.set(null);

    if (!success) {
      this.insufficientFundsFor.set(item.type);
    }
  }

  onOpenThemes(): void {
    void this.router.navigateByUrl('/themes');
  }
}
