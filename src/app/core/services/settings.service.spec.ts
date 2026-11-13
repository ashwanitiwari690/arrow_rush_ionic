import { TestBed } from '@angular/core/testing';
import { SettingsService } from './settings.service';
import { StorageService } from './storage.service';

describe('SettingsService audio preferences', () => {
  const storage = { get: vi.fn(), set: vi.fn().mockResolvedValue(undefined) };
  let settings: SettingsService;
  beforeEach(() => {
    storage.get.mockResolvedValue({ soundEnabled: false, musicEnabled: true });
    TestBed.configureTestingModule({ providers: [{ provide: StorageService, useValue: storage }] });
    settings = TestBed.inject(SettingsService);
  });

  it('migrates old settings while keeping the existing mute preference', async () => {
    await settings.init();
    expect(settings.settings().soundEnabled).toBe(false);
    expect(settings.settings().soundVolume).toBe(0.7);
    expect(settings.settings().musicVolume).toBe(0.35);
  });

  it('persists independent volumes within a valid range', async () => {
    await settings.update({ soundVolume: 2, musicVolume: -1 });
    expect(settings.settings().soundVolume).toBe(1);
    expect(settings.settings().musicVolume).toBe(0);
    expect(storage.set).toHaveBeenLastCalledWith('arrow_rush.settings', settings.settings());
  });

  it('restores a usable default for invalid saved volume data', async () => {
    storage.get.mockResolvedValue({ soundVolume: null, musicVolume: 'loud' });
    await settings.init();
    expect(settings.settings().soundVolume).toBe(0.7);
    expect(settings.settings().musicVolume).toBe(0.35);
  });
});
