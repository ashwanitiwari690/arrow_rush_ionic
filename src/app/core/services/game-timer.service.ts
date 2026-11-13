import { Injectable, signal } from '@angular/core';

/**
 * Per-level countdown timer. Not a singleton session — GamePlayPage creates its own
 * lifetime for this via `providers: [GameTimerService]` so state can't leak between
 * levels, and calls `stop()` in ngOnDestroy to guarantee the interval is cleared.
 */
@Injectable()
export class GameTimerService {
  private readonly _remainingSeconds = signal(0);
  private readonly _elapsedSeconds = signal(0);
  private readonly _isRunning = signal(false);

  readonly remainingSeconds = this._remainingSeconds.asReadonly();
  readonly elapsedSeconds = this._elapsedSeconds.asReadonly();
  readonly isRunning = this._isRunning.asReadonly();

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private onExpire: (() => void) | null = null;
  private remainingMs = 0;
  private elapsedMs = 0;
  private lastTick = 0;

  start(totalSeconds: number, onExpire: () => void): void {
    this.stop();
    this._remainingSeconds.set(totalSeconds);
    this._elapsedSeconds.set(0);
    this.remainingMs = totalSeconds * 1000;
    this.elapsedMs = 0;
    this.onExpire = onExpire;
    this.resume();
  }

  resume(): void {
    if (this.intervalId !== null || !this.onExpire) return;
    if (this.remainingMs <= 0) { this.expire(); return; }
    this.lastTick = performance.now();
    this._isRunning.set(true);
    this.intervalId = setInterval(() => this.tick(), 1000);
  }

  pause(): void {
    if (this.intervalId !== null) {
      this.updateClock();
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this._isRunning.set(false);
  }

  stop(): void {
    this.pause();
    this.onExpire = null;
  }

  addSeconds(seconds: number): void {
    if (this._isRunning()) this.updateClock();
    this.remainingMs += Math.max(0, seconds) * 1000;
    this._remainingSeconds.set(Math.ceil(this.remainingMs / 1000));
  }

  private tick(): void {
    this.updateClock();
    const remaining = this._remainingSeconds();

    if (remaining <= 0) {
      this._remainingSeconds.set(0);
      this.expire();
    }
  }

  private expire(): void {
    this.pause();
    const callback = this.onExpire;
    this.onExpire = null;
    callback?.();
  }

  private updateClock(): void {
    const now = performance.now();
    const delta = Math.min(this.remainingMs, Math.max(0, now - this.lastTick));
    this.lastTick = now;
    this.remainingMs = Math.max(0, this.remainingMs - delta);
    this.elapsedMs += delta;
    this._remainingSeconds.set(Math.ceil(this.remainingMs / 1000));
    this._elapsedSeconds.set(Math.floor(this.elapsedMs / 1000));
  }
}
