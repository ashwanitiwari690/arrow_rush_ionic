import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LocalGameRewardApiService } from './local-game-reward-api.service';
import { ConfigService } from './config.service';
import { StorageService } from './storage.service';
import { environment } from '../../../environments/environment';

// In-memory StorageService stand-in — avoids depending on Capacitor's web Preferences
// bridge (which needs a real DOM/localStorage bootstrap) and keeps this test fast and isolated.
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

describe('LocalGameRewardApiService — anti-duplicate reward protection', () => {
  let service: LocalGameRewardApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ConfigService, useClass: FakeConfigService },
        { provide: StorageService, useClass: FakeStorageService },
      ],
    });
    service = TestBed.inject(LocalGameRewardApiService);
  });

  it('credits coins once for a given idempotency key', async () => {
    const result = await service.submitGameReward({
      gameCode: 'ARROW_RUSH',
      levelId: 1,
      score: 500,
      coins: 10,
      idempotencyKey: 'key-1',
    });

    expect(result.accepted).toBe(true);
    expect(result.coinsAwarded).toBe(10);
  });

  it('rejects a second submission with the same idempotency key (double-tap / retried callback)', async () => {
    const payload = {
      gameCode: 'ARROW_RUSH',
      levelId: 1,
      score: 500,
      coins: 10,
      idempotencyKey: 'duplicate-key',
    };

    const first = await service.submitGameReward(payload);
    const second = await service.submitGameReward(payload);

    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(false);
    expect(second.coinsAwarded).toBe(0);
  });
});

describe('LocalGameRewardApiService — redeemCoins HTTP integration', () => {
  let service: LocalGameRewardApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ConfigService, useClass: FakeConfigService },
        { provide: StorageService, useClass: FakeStorageService },
      ],
    });
    service = TestBed.inject(LocalGameRewardApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  const payload = {
    gameCode: 'ARROW_RUSH',
    mobileNumber: '9876543210',
    coins: 1000,
    idempotencyKey: 'redeem-1',
  };

  it('POSTs to {apiBaseUrl}/redeem with the exact request contract and unwraps the response', async () => {
    const promise = service.redeemCoins(payload);

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/redeem`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);

    req.flush({
      success: true,
      data: {
        gameCode: 'ARROW_RUSH',
        gameName: 'Arrow Rush',
        coinsSubmitted: 1000,
        coinsRedeemed: 1000,
        coinsPerConversion: 1000,
        rupeesPerConversion: 10,
        amountCredited: '10.00',
        transactionId: 'txn-1',
        idempotencyKey: 'redeem-1',
        status: 'COMPLETED',
        createdAt: new Date().toISOString(),
        newWalletBalance: '10.00',
      },
    });

    const response = await promise;
    expect(response.coinsRedeemed).toBe(1000);
    expect(response.amountCredited).toBe('10.00');
  });

  it('surfaces the backend error envelope (e.g. a duplicate conversion) with its error code', async () => {
    const promise = service.redeemCoins(payload);

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/redeem`);
    req.flush(
      { success: false, error: { code: 'DUPLICATE_CONVERSION', message: 'Already processed.' } },
      { status: 409, statusText: 'Conflict' },
    );

    await expect(promise).rejects.toMatchObject({ errorCode: 'DUPLICATE_CONVERSION' });
  });

  it('normalizes a network failure to a friendly, retryable error', async () => {
    const promise = service.redeemCoins(payload);

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/redeem`);
    req.error(new ProgressEvent('error'), { status: 0 });

    await expect(promise).rejects.toMatchObject({ errorCode: 'NETWORK_ERROR' });
  });
});
