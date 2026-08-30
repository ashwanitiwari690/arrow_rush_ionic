import { TestBed } from '@angular/core/testing';
import { CoinService } from './coin.service';
import { ConfigService } from './config.service';
import { StorageService } from './storage.service';

class FakeStorageService {
  private store = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | null> {
    return (this.store.has(key) ? this.store.get(key) : null) as T | null;
  }
  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }
  async remove(key: string): Promise<void> {
    this.store.delete(key);
  }
  async clear(): Promise<void> {
    this.store.clear();
  }
}

class FakeConfigService {
  async getGameConfig() {
    return { startingCoins: 0, livesPerLevel: 3, livesRegenMinutes: 10, totalLevels: 100 };
  }
}

describe('CoinService', () => {
  let service: CoinService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: ConfigService, useClass: FakeConfigService },
        { provide: StorageService, useClass: FakeStorageService },
      ],
    });
    service = TestBed.inject(CoinService);
  });

  it('starts at the configured starting balance', async () => {
    await service.init();
    expect(service.balance()).toBe(0);
  });

  it('adds coins and records a transaction', async () => {
    await service.addCoins(50, 'LEVEL_REWARD', 'level_complete', 1);
    expect(service.balance()).toBe(50);

    const history = await service.getTransactionHistory();
    expect(history[0].amount).toBe(50);
    expect(history[0].type).toBe('LEVEL_REWARD');
  });

  it('refuses to spend more coins than the current balance', async () => {
    await service.addCoins(30, 'LEVEL_REWARD', 'level_complete');
    const spent = await service.spendCoins(50, 'POWERUP_PURCHASE', 'HINT');

    expect(spent).toBe(false);
    expect(service.balance()).toBe(30); // unchanged — no partial/negative spend
  });

  it('spends coins when the balance is sufficient', async () => {
    await service.addCoins(100, 'LEVEL_REWARD', 'level_complete');
    const spent = await service.spendCoins(60, 'POWERUP_PURCHASE', 'HINT');

    expect(spent).toBe(true);
    expect(service.balance()).toBe(40);
  });

  it('confirmRedemption deducts exactly the backend-reported amount', async () => {
    await service.addCoins(1500, 'LEVEL_REWARD', 'level_complete');
    await service.confirmRedemption(1000);

    expect(service.balance()).toBe(500);
    const history = await service.getTransactionHistory();
    expect(history[0]).toMatchObject({ type: 'REDEMPTION', amount: -1000 });
  });

  it('confirmRedemption clamps to the current balance rather than going negative', async () => {
    await service.addCoins(200, 'LEVEL_REWARD', 'level_complete');
    // Simulates a backend response reporting more than the device's local balance —
    // must never be trusted blindly into a negative balance.
    await service.confirmRedemption(1000);

    expect(service.balance()).toBe(0);
  });
});
