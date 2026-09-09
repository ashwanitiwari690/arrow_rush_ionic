import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import { AdvertisingId } from '@capacitor-community/advertising-id';
import { environment } from '../../../environments/environment';

interface AppVerificationSuccessResponse {
  success: true;
  data: { status: string; rewardAmount: string };
}

/**
 * Confirms Earnivo's "App Promotion" task: Earnivo captures the device's Advertising ID
 * (GAID/IDFA) when the user starts the task and opens this app's store listing; once the
 * user actually opens this app, calling the confirm endpoint with that same device's
 * current Advertising ID is the only signal Earnivo has to credit the reward — there is
 * no button for the user to press on Earnivo's side. Per the integration contract this is
 * safe to call on every app launch: a `422` just means there's nothing pending for this
 * device right now (the normal case), not a failure to surface to the player.
 */
@Injectable({ providedIn: 'root' })
export class AppVerificationService {
  private readonly http = inject(HttpClient);

  async verifyAppPromotion(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    if (!environment.earnivo.appVerification.apiKey) return;

    const advertisingId = await this.readAdvertisingId();
    if (!advertisingId) return;

    try {
      await firstValueFrom(
        this.http.post<AppVerificationSuccessResponse>(environment.earnivo.appVerification.confirmUrl, {
          apiKey: environment.earnivo.appVerification.apiKey,
          advertisingId,
        }),
      );
    } catch (err) {
      if (environment.production) return;
      if (err instanceof HttpErrorResponse && err.status === 422) {
        // Normal outcome whenever there's nothing pending for this device yet.
        console.debug('[AppVerificationService] no pending verification for this device');
      } else {
        console.debug('[AppVerificationService] confirm call failed', err);
      }
    }
  }

  private async readAdvertisingId(): Promise<string | null> {
    try {
      if (Capacitor.getPlatform() === 'ios') {
        await AdvertisingId.requestTracking();
      }
      const { id, status } = await AdvertisingId.getAdvertisingId();
      if (!id || status === 'Denied' || status === 'Restricted') return null;
      return id;
    } catch (err) {
      if (!environment.production) {
        console.debug('[AppVerificationService] could not read advertising id', err);
      }
      return null;
    }
  }
}
