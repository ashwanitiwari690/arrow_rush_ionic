import { GameTimerService } from './game-timer.service';

describe('GameTimerService', () => {
  let timer: GameTimerService;

  beforeEach(() => {
    vi.useFakeTimers();
    timer = new GameTimerService();
  });
  afterEach(() => { timer.stop(); vi.useRealTimers(); });

  it('preserves partial seconds across pauses and excludes time away', () => {
    timer.start(10, vi.fn());
    vi.advanceTimersByTime(1500);
    timer.pause();
    vi.advanceTimersByTime(30000);
    expect(timer.remainingSeconds()).toBe(9);
    timer.resume();
    vi.advanceTimersByTime(1500);
    timer.pause();
    expect(timer.remainingSeconds()).toBe(7);
    expect(timer.elapsedSeconds()).toBe(3);
  });

  it('uses elapsed time when callbacks are delayed', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    timer.start(10, vi.fn());
    now = 4000;
    vi.advanceTimersByTime(1000);
    expect(timer.remainingSeconds()).toBe(6);
    expect(timer.elapsedSeconds()).toBe(4);
    vi.restoreAllMocks();
  });

  it('expires only once and cannot restart an expired or stopped timer', () => {
    const expire = vi.fn();
    timer.start(2, expire);
    vi.advanceTimersByTime(5000);
    timer.resume();
    vi.advanceTimersByTime(5000);
    expect(expire).toHaveBeenCalledTimes(1);
    expect(timer.isRunning()).toBe(false);
    timer.start(10, expire);
    timer.stop();
    timer.resume();
    expect(timer.isRunning()).toBe(false);
  });

  it('adds time without counting it as elapsed play time', () => {
    timer.start(10, vi.fn());
    vi.advanceTimersByTime(2000);
    timer.addSeconds(15);
    expect(timer.remainingSeconds()).toBe(23);
    expect(timer.elapsedSeconds()).toBe(2);
  });

  it('handles a pause at the deadline without leaving a zero-second game stuck', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const expire = vi.fn();
    timer.start(1, expire);
    now = 1000;
    timer.pause();
    timer.resume();
    timer.resume();
    expect(expire).toHaveBeenCalledOnce();
    expect(timer.isRunning()).toBe(false);
    vi.restoreAllMocks();
  });
});
