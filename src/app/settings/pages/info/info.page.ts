import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { App } from '@capacitor/app';
import { environment } from '../../../../environments/environment';

export type InfoTopic = 'about' | 'privacy' | 'terms';

@Component({
  selector: 'app-info',
  templateUrl: './info.page.html',
  styleUrls: ['./info.page.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InfoPage implements OnInit {
  private readonly route = inject(ActivatedRoute);

  readonly selectedTopic = signal<InfoTopic>('about');
  readonly appVersion = signal<string>(environment.appVersion ?? '1.0.0');

  async ngOnInit(): Promise<void> {
    this.resolveInitialTopic();
    await this.loadAppVersion();
  }

  get pageTitle(): string {
    switch (this.selectedTopic()) {
      case 'privacy':
        return 'Privacy Policy';
      case 'terms':
        return 'Terms of Service';
      case 'about':
      default:
        return 'About Arrow Rush';
    }
  }

  setTopic(topic: string | number | undefined): void {
    if (topic === 'privacy' || topic === 'terms' || topic === 'about') {
      this.selectedTopic.set(topic);
    }
  }

  private resolveInitialTopic(): void {
    const dataTopic = this.route.snapshot.data['topic'] as string | undefined;
    const paramTopic = this.route.snapshot.paramMap.get('topic');
    const raw = (dataTopic || paramTopic || '').toLowerCase();

    if (raw.includes('privacy')) {
      this.selectedTopic.set('privacy');
    } else if (raw.includes('term')) {
      this.selectedTopic.set('terms');
    } else {
      this.selectedTopic.set('about');
    }
  }

  private async loadAppVersion(): Promise<void> {
    try {
      const info = await App.getInfo();
      if (info?.version) {
        this.appVersion.set(info.version);
      }
    } catch {
      // Running on web or plugin unavailable
    }
  }
}

