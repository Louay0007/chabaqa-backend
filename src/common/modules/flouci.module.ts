import { Module } from '@nestjs/common';
import { FlouciPaymentService } from '../services/flouci-payment.service';

@Module({
  providers: [FlouciPaymentService],
  exports: [FlouciPaymentService],
})
export class FlouciModule {}


