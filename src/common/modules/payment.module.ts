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

@Module({
  imports: [
    ConfigModule.forRoot(),
    MongooseModule.forFeature([
      { name: Community.name, schema: CommunitySchema },
      { name: User.name, schema: UserSchema },
      { name: Order.name, schema: OrderSchema },
    ]),
  ],
  controllers: [PaymentController],
  providers: [StripePaymentService, PromoService, FeeService],
  exports: [StripePaymentService],
})
export class PaymentModule {}