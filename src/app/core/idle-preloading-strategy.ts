import { Injectable } from '@angular/core';
import { PreloadingStrategy, Route } from '@angular/router';
import { Observable, from, of } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';

/**
 * Preloads every lazy route's chunk, same end state as PreloadAllModules, but only once the
 * main thread is idle (or after a fallback timeout) instead of immediately after boot. That
 * keeps the very first frame (Home) from competing with 8 other route chunks fetching +
 * evaluating in the background right as the app launches — the difference only matters for
 * that first second or two; every route ends up preloaded either way.
 *
 * Mirrors PreloadAllModules' own `catchError(() => of(null))` safety net — the router's
 * `load()` can legitimately complete without emitting (e.g. a route already loaded via a
 * direct navigation before its turn to preload came up), and without swallowing that here it
 * surfaces as an unhandled EmptyError.
 */
@Injectable({ providedIn: 'root' })
export class IdlePreloadingStrategy implements PreloadingStrategy {
  preload(_route: Route, load: () => Observable<unknown>): Observable<unknown> {
    return from(this.waitForIdle()).pipe(
      mergeMap(() => load()),
      catchError(() => of(null)),
    );
  }

  private waitForIdle(): Promise<void> {
    return new Promise((resolve) => {
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(() => resolve(), { timeout: 3000 });
      } else {
        setTimeout(resolve, 1000);
      }
    });
  }
}
