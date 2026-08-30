import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { CoinService } from '../../../core/services/coin.service';

@Component({
  selector: 'app-coin-balance',
  templateUrl: './coin-balance.component.html',
  styleUrls: ['./coin-balance.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CoinBalanceComponent implements OnInit {
  private readonly coinService = inject(CoinService);
  readonly balance = this.coinService.balance;

  ngOnInit(): void {
    void this.coinService.init();
  }
}
