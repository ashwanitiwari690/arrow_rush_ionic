import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { IdlePreloadingStrategy } from './idle-preloading-strategy';

describe('IdlePreloadingStrategy', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('requestIdleCallback', undefined); });
  afterEach(() => { TestBed.resetTestingModule(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('does not request routes without explicit preloading enabled', async () => {
    const load = vi.fn(() => of('settings'));
    const strategy = TestBed.inject(IdlePreloadingStrategy);
    expect(await firstValueFrom(strategy.preload({ path: 'settings' }, load))).toBeNull();
    expect(load).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('warms selected routes after the idle fallback instead of during startup', async () => {
    const load = vi.fn(() => of('gameplay'));
    const result = firstValueFrom(TestBed.inject(IdlePreloadingStrategy).preload({ data: { preload: true } }, load));
    expect(load).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(await result).toBe('gameplay');
    expect(load).toHaveBeenCalledOnce();
  });

  it('uses the browser idle callback and recovers from preload failures', async () => {
    let idle!: () => void;
    vi.stubGlobal('requestIdleCallback', vi.fn((callback: () => void) => { idle = callback; return 1; }));
    const load = vi.fn(() => throwError(() => new Error('Chunk unavailable')));
    const result = firstValueFrom(TestBed.inject(IdlePreloadingStrategy).preload({ data: { preload: true } }, load));
    expect(load).not.toHaveBeenCalled();
    idle();
    expect(await result).toBeNull();
  });
});
