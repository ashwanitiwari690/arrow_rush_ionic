import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LevelService } from './level.service';
import { StorageService } from './storage.service';

describe('LevelService asset caching', () => {
  let levels: LevelService;
  let http: HttpTestingController;
  const path = (id: number) => `assets/levels/level-${String(id).padStart(3, '0')}.json`;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(),
      { provide: StorageService, useValue: { get: vi.fn(), set: vi.fn() } },
    ] });
    levels = TestBed.inject(LevelService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('shares concurrent index and level requests', async () => {
    const indexes = [levels.getLevelIndex(), levels.getLevelIndex()];
    http.expectOne('assets/levels/levels-index.json').flush([{ levelId: 1 }]);
    expect(await indexes[0]).toBe(await indexes[1]);
    const boards = [levels.getLevel(1), levels.getLevel(1)];
    http.expectOne(path(1)).flush({ levelId: 1 });
    expect(await boards[0]).toBe(await boards[1]);
  });

  it('retries failed level loads', async () => {
    const failed = levels.getLevel(1);
    const rejected = expect(failed).rejects.toBeDefined();
    http.expectOne(path(1)).flush('unavailable', { status: 503, statusText: 'Unavailable' });
    await rejected;
    const retry = levels.getLevel(1);
    http.expectOne(path(1)).flush({ levelId: 1 });
    expect((await retry).levelId).toBe(1);
  });

  it('keeps recently replayed boards while evicting older boards', async () => {
    for (let id = 1; id <= 12; id++) {
      const loading = levels.getLevel(id);
      http.expectOne(path(id)).flush({ levelId: id });
      await loading;
    }
    await levels.getLevel(1);
    http.expectNone(path(1));
    const next = levels.getLevel(13);
    http.expectOne(path(13)).flush({ levelId: 13 });
    await next;
    await levels.getLevel(1);
    http.expectNone(path(1));
    const evicted = levels.getLevel(2);
    http.expectOne(path(2)).flush({ levelId: 2 });
    await evicted;
  });
});
