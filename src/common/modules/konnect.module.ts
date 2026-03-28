import { Module } from '@nestjs/common';
import { KonnectPaymentService } from '../services/konnect-payment.service';

@Module({
  providers: [KonnectPaymentService],
  exports: [KonnectPaymentService],
})
export class KonnectModule {}
