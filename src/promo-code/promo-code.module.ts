import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PromoCode, PromoCodeSchema } from '../schema/promo-code.schema';
import { Order, OrderSchema } from '../schema/order.schema';
import { User, UserSchema } from '../schema/user.schema';
import { PromoCodeService } from './promo-code.service';
import { PromoCodeController } from './promo-code.controller';
import { PromoCodeAdminController } from './promo-code-admin.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PromoCode.name, schema: PromoCodeSchema },
      { name: Order.name, schema: OrderSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [PromoCodeController, PromoCodeAdminController],
  providers: [PromoCodeService],
  exports: [PromoCodeService],
})
export class PromoCodeModule {}
