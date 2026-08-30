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

  start(totalSeconds: number, onExpire: () => void): void {
    this.stop();
    this._remainingSeconds.set(totalSeconds);
    this._elapsedSeconds.set(0);
    this.onExpire = onExpire;
    this.resume();
  }

  resume(): void {
    if (this.intervalId !== null) return;
    this._isRunning.set(true);
    this.intervalId = setInterval(() => this.tick(), 1000);
  }

  pause(): void {
    if (this.intervalId !== null) {
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
    this._remainingSeconds.set(this._remainingSeconds() + seconds);
  }

  private tick(): void {
    this._elapsedSeconds.set(this._elapsedSeconds() + 1);
    const remaining = this._remainingSeconds() - 1;

    if (remaining <= 0) {
      this._remainingSeconds.set(0);
      this.pause();
      this.onExpire?.();
      return;
    }

    this._remainingSeconds.set(remaining);
  }
}
