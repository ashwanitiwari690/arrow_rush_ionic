import { CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ProfilePage } from './profile.page';
import { CoinService } from '../../../core/services/coin.service';
import { LevelService } from '../../../core/services/level.service';
import { ScoreService } from '../../../core/services/score.service';
import { AchievementService } from '../../../core/services/achievement.service';
import { ConfigService } from '../../../core/services/config.service';
import { GameRewardApiService } from '../../../core/services/game-reward-api.service';
import { RedeemApiError } from '../../../core/services/local-game-reward-api.service';
import { StorageService } from '../../../core/services/storage.service';

describe('ProfilePage — Redeem Error Handling', () => {
  let component: ProfilePage;
  let fixture: ComponentFixture<ProfilePage>;
  let mockRewardApi: { redeemCoins: ReturnType<typeof vi.fn> };
  let mockStorage: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
  let mockCoinService: { balance: () => number; init: ReturnType<typeof vi.fn>; confirmRedemption: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockRewardApi = {
      redeemCoins: vi.fn(),
    };
    mockStorage = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    mockCoinService = {
      balance: signal(2000),
      init: vi.fn().mockResolvedValue(undefined),
      confirmRedemption: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      declarations: [ProfilePage],
      providers: [
        { provide: CoinService, useValue: mockCoinService },
        {
          provide: LevelService,
          useValue: {
            init: vi.fn().mockResolvedValue(undefined),
            progress: signal({}),
            completedCount: () => 5,
          },
        },
        {
          provide: ScoreService,
          useValue: {
            totalScore: signal(5000),
          },
        },
        {
          provide: AchievementService,
          useValue: {
            init: vi.fn().mockResolvedValue(undefined),
            achievements: signal([]),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            getGameConfig: vi.fn().mockResolvedValue({ totalLevels: 520 }),
          },
        },
        { provide: GameRewardApiService, useValue: mockRewardApi },
        { provide: StorageService, useValue: mockStorage },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(ProfilePage);
    component = fixture.componentInstance;
    await component.ngOnInit();
  });

  it('displays the backend validation error message when Earnivo account is not found', async () => {
    const errorMsg = 'No Earnivo account found with this mobile number. Please register in the Earnivo app first.';
    mockRewardApi.redeemCoins.mockRejectedValueOnce(
      new RedeemApiError(errorMsg, 'VALIDATION_ERROR'),
    );

    component.withdrawNumber.set('9876543210');
    fixture.detectChanges();

    await component.onWithdraw();
    fixture.detectChanges();

    expect(component.redeemState()).toBe('error');
    expect(component.redeemMessage()).toBe(errorMsg);

    const errorEl = fixture.nativeElement.querySelector('.redeem-message.error');
    expect(errorEl).toBeTruthy();
    expect(errorEl.textContent).toContain(errorMsg);
  });

  it('displays already processed message on duplicate conversion', async () => {
    mockRewardApi.redeemCoins.mockRejectedValueOnce(
      new RedeemApiError('Already processed.', 'DUPLICATE_CONVERSION'),
    );

    component.withdrawNumber.set('9876543210');
    await component.onWithdraw();
    fixture.detectChanges();

    expect(component.redeemState()).toBe('error');
    expect(component.redeemMessage()).toBe('This redemption was already processed.');

    const errorEl = fixture.nativeElement.querySelector('.redeem-message.error');
    expect(errorEl).toBeTruthy();
    expect(errorEl.textContent).toContain('This redemption was already processed.');
  });

  it('dismisses the error when dismiss button is clicked', async () => {
    mockRewardApi.redeemCoins.mockRejectedValueOnce(
      new RedeemApiError('Some error', 'VALIDATION_ERROR'),
    );

    component.withdrawNumber.set('9876543210');
    await component.onWithdraw();
    fixture.detectChanges();

    expect(component.redeemMessage()).toBeTruthy();

    component.dismissRedeemResult();
    fixture.detectChanges();

    expect(component.redeemState()).toBe('idle');
    expect(component.redeemMessage()).toBeNull();
    expect(component.withdrawNumber()).toBe('');
  });
});

