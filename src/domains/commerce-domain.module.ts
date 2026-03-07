import { Module } from '@nestjs/common';
import { PaymentModule } from '../common/modules/payment.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { WalletModule } from '../wallet/wallet.module';
import { PayoutModule } from '../payout/payout.module';
import { ProductModule } from '../product/product.module';
import { SessionModule } from '../session/session.module';
import { EventModule } from '../event/event.module';
import { FeeModule } from '../common/modules/fee.module';
import { PromoModule } from '../common/modules/promo.module';
import { FlouciModule } from '../common/modules/flouci.module';

@Module({
  imports: [
    PaymentModule,
    SubscriptionModule,
    WalletModule,
    PayoutModule,
    ProductModule,
    SessionModule,
    EventModule,
    FeeModule,
    PromoModule,
    FlouciModule,
  ],
  exports: [
    PaymentModule,
    SubscriptionModule,
    WalletModule,
    PayoutModule,
    ProductModule,
    SessionModule,
    EventModule,
    FeeModule,
    PromoModule,
    FlouciModule,
  ],
})
export class CommerceDomainModule {}
