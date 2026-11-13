import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ConfigService } from './config.service';

describe('ConfigService request caching', () => {
  let config: ConfigService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    config = TestBed.inject(ConfigService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('shares one config request across concurrent startup services', async () => {
    const first = config.getGameConfig();
    const second = config.getGameConfig();
    http.expectOne('assets/config/game-config.json').flush({ totalLevels: 520 });
    expect(await first).toBe(await second);
    await config.getGameConfig();
    http.expectNone('assets/config/game-config.json');
  });

  it('allows a failed config request to be retried', async () => {
    const first = config.getGameConfig();
    const rejected = expect(first).rejects.toBeDefined();
    http.expectOne('assets/config/game-config.json').flush('unavailable', { status: 503, statusText: 'Unavailable' });
    await rejected;
    const retry = config.getGameConfig();
    http.expectOne('assets/config/game-config.json').flush({ totalLevels: 520 });
    expect((await retry).totalLevels).toBe(520);
  });
});
