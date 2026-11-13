import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { CoinService } from '../../../core/services/coin.service';
import { CoinIconComponent } from '../coin-icon/coin-icon.component';

@Component({
  selector: 'app-coin-balance',
  templateUrl: './coin-balance.component.html',
  styleUrls: ['./coin-balance.component.scss'],
  standalone: true,
  imports: [DecimalPipe, CoinIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CoinBalanceComponent implements OnInit {
  private readonly coinService = inject(CoinService);
  readonly balance = this.coinService.balance;

  ngOnInit(): void {
    void this.coinService.init();
  }
}
