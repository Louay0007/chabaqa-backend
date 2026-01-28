import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StripePaymentService } from '../services/stripe-payment.service';
import { PaymentController } from '../controllers/payment.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Community, CommunitySchema } from '../../schema/community.schema';
import { User, UserSchema } from '../../schema/user.schema';
import { Order, OrderSchema } from '../../schema/order.schema';
import { PromoService } from '../services/promo.service';
import { FeeService } from '../services/fee.service';
import { ManualPaymentService } from '../services/manual-payment.service';
import { UploadModule } from '../../upload/upload.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    MongooseModule.forFeature([
      { name: Community.name, schema: CommunitySchema },
      { name: User.name, schema: UserSchema },
      { name: Order.name, schema: OrderSchema },
    ]),
    UploadModule,
  ],
  controllers: [PaymentController],
  providers: [StripePaymentService, PromoService, FeeService, ManualPaymentService],
  exports: [StripePaymentService, ManualPaymentService],
})
export class PaymentModule { }