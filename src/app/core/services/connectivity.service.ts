import { Injectable, signal } from '@angular/core';

/**
 * Tracks whether the device currently has a network connection. Ad revenue
 * funds this app's economy, so gameplay is blocked while offline (full-screen
 * message, no partial functionality) rather than letting the player earn
 * coins with no ad ever having been requested or shown.
 *
 * Uses Angular signals so OnPush components (like AppComponent) react
 * automatically when the status flips.
 */
@Injectable({ providedIn: 'root' })
export class ConnectivityService {
  /** Reactive signal — `true` when the browser/device reports a network connection. */
  readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);

  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('online', () => { this.online.set(true); });
    window.addEventListener('offline', () => { this.online.set(false); });
  }

  /** Re-reads the browser's connectivity flag directly, for a manual "Try Again" action. */
  recheck(): void {
    if (typeof navigator !== 'undefined') this.online.set(navigator.onLine);
  }
}

