import { Injectable } from '@angular/core';
import { PreloadingStrategy, Route } from '@angular/router';
import { Observable, from, of } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';

/** Warm only explicitly selected routes when idle; other screens load on navigation. */
@Injectable({ providedIn: 'root' })
export class IdlePreloadingStrategy implements PreloadingStrategy {
  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    if (route.data?.['preload'] !== true) return of(null);
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
