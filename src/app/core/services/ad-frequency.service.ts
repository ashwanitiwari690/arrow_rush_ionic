import { Injectable, inject } from '@angular/core';
import { StorageService } from './storage.service';
import { AD_POLICY } from '../config/admob.config';
import { environment } from '../../../environments/environment';

export type FullScreenAdFormat = 'interstitial' | 'rewarded';
export type AdRequestFormat = FullScreenAdFormat | 'banner';
interface FrequencyRecord {
  lastDismissedAt: number;
  interstitial: number[];
  rewarded: number[];
  bannerWindows: number[];
  requests: Record<AdRequestFormat, number[]>;
}
const KEY = 'arrow_rush.ad_frequency';
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

/** Persists displays and request reservations across normal application restarts. */
@Injectable({ providedIn: 'root' })
export class AdFrequencyService {
  private readonly storage = inject(StorageService);
  private readonly sessionStartedAt = Date.now();
  private record: FrequencyRecord = {
    lastDismissedAt: 0, interstitial: [], rewarded: [], bannerWindows: [],
    requests: { banner: [], interstitial: [], rewarded: [] },
  };
  private initPromise?: Promise<void>;
  private restored = false;
  private persistQueue = Promise.resolve();
  private rounds = 0;
  private readonly roundIds = new Set<string>();

  init(): Promise<void> {
    this.initPromise ??= this.storage.get<FrequencyRecord>(KEY).then((stored) => {
      if (!stored) { this.restored = true; return; }
      this.record = {
        lastDismissedAt: Number.isFinite(stored.lastDismissedAt) ? stored.lastDismissedAt : 0,
        interstitial: Array.isArray(stored.interstitial) ? stored.interstitial.filter(Number.isFinite) : [],
        rewarded: Array.isArray(stored.rewarded) ? stored.rewarded.filter(Number.isFinite) : [],
        bannerWindows: Array.isArray(stored.bannerWindows) ? stored.bannerWindows.filter(Number.isFinite) : [],
        requests: {
          banner: Array.isArray(stored.requests?.banner) ? stored.requests.banner.filter(Number.isFinite) : [],
          interstitial: Array.isArray(stored.requests?.interstitial) ? stored.requests.interstitial.filter(Number.isFinite) : [],
          rewarded: Array.isArray(stored.requests?.rewarded) ? stored.requests.rewarded.filter(Number.isFinite) : [],
        },
      };
      this.prune();
      this.restored = true;
    }).catch(() => { /* Defer ads if persisted limits cannot be restored. */ });
    return this.initPromise;
  }

  completeRound(roundId: string): void {
    if (!roundId || this.roundIds.has(roundId)) return;
    this.roundIds.add(roundId);
    this.rounds++;
    if (this.roundIds.size > 100) this.roundIds.delete(this.roundIds.values().next().value!);
  }

  canShow(format: FullScreenAdFormat): boolean {
    if (!this.restored) return false;
    this.prune();
    const now = Date.now();
    const all = [...this.record.interstitial, ...this.record.rewarded];
    if (this.withinHour(all) >= AD_POLICY.fullScreenAdsPerHour || all.length >= AD_POLICY.fullScreenAdsPerDay) return false;
    if (format === 'rewarded') {
      return (this.record.lastDismissedAt === 0 || now - this.record.lastDismissedAt >= AD_POLICY.rewardedCooldownMs)
        && this.withinHour(this.record.rewarded) < AD_POLICY.rewardedAdsPerHour
        && this.record.rewarded.length < AD_POLICY.rewardedAdsPerDay;
    }
    return this.rounds >= Math.max(5, environment.ads.interstitialLevelInterval)
      && now - Math.max(this.sessionStartedAt, this.record.lastDismissedAt) >= AD_POLICY.interstitialCooldownMs
      && this.withinHour(this.record.interstitial) < AD_POLICY.interstitialsPerHour
      && this.record.interstitial.length < AD_POLICY.interstitialsPerDay;
  }

  /** Reserve attempts before calling the SDK; errors and no-fill still consume a request. */
  reserveRequest(format: AdRequestFormat): boolean {
    if (!this.restored) return false;
    if (this.nextRequestAllowedAt(format) > Date.now()) return false;
    this.record.requests[format].push(Date.now());
    this.persist();
    return true;
  }

  nextRequestAllowedAt(format: AdRequestFormat): number {
    if (!this.restored) return Date.now() + AD_POLICY.retryMaxMs;
    this.prune();
    const times = this.record.requests[format];
    const all = Object.values(this.record.requests).flat().sort((a, b) => a - b);
    const limits = AD_POLICY.requestLimits[format];
    return Math.max(
      Date.now(), (times.at(-1) ?? -Infinity) + AD_POLICY.requestCooldownMs,
      this.windowOpensAt(times, HOUR, limits.perHour), this.windowOpensAt(times, DAY, limits.perDay),
      this.windowOpensAt(all, HOUR, AD_POLICY.requestsPerHour), this.windowOpensAt(all, DAY, AD_POLICY.requestsPerDay),
    );
  }

  /** Banner exposure windows are local safeguards, not reported Google impressions. */
  reserveBannerWindow(): boolean {
    if (!this.canStartBannerWindow()) return false;
    this.record.bannerWindows.push(Date.now());
    this.persist();
    return true;
  }

  canStartBannerWindow(): boolean {
    if (!this.restored) return false;
    this.prune();
    const times = this.record.bannerWindows;
    if (Date.now() - (times.at(-1) ?? -Infinity) < AD_POLICY.bannerWindowCooldownMs
      || this.withinHour(times) >= AD_POLICY.bannerWindowsPerHour || times.length >= AD_POLICY.bannerWindowsPerDay) return false;
    return true;
  }

  shown(format: FullScreenAdFormat): void {
    this.prune();
    this.record[format].push(Date.now());
    this.record.lastDismissedAt = Date.now();
    this.rounds = 0;
    this.persist();
  }

  dismissed(): void {
    this.record.lastDismissedAt = Date.now();
    this.persist();
  }

  private prune(): void {
    const cutoff = Date.now() - DAY;
    this.record.interstitial = this.record.interstitial.filter((time) => time > cutoff);
    this.record.rewarded = this.record.rewarded.filter((time) => time > cutoff);
    this.record.bannerWindows = this.record.bannerWindows.filter((time) => time > cutoff);
    for (const format of ['banner', 'interstitial', 'rewarded'] as const) {
      this.record.requests[format] = this.record.requests[format].filter((time) => time > cutoff);
    }
  }

  private withinHour(times: number[]): number {
    return times.filter((time) => time > Date.now() - HOUR).length;
  }

  private windowOpensAt(times: number[], windowMs: number, limit: number): number {
    const recent = times.filter((time) => time > Date.now() - windowMs).sort((a, b) => a - b);
    return recent.length < limit ? 0 : recent[recent.length - limit] + windowMs;
  }

  private persist(): void {
    const snapshot: FrequencyRecord = {
      ...this.record, interstitial: [...this.record.interstitial], rewarded: [...this.record.rewarded],
      bannerWindows: [...this.record.bannerWindows],
      requests: {
        banner: [...this.record.requests.banner], interstitial: [...this.record.requests.interstitial], rewarded: [...this.record.requests.rewarded],
      },
    };
    this.persistQueue = this.persistQueue.then(() => this.storage.set(KEY, snapshot)).catch(() => {
      this.restored = false; // Stop further requests when limits cannot be retained.
    });
  }
}
