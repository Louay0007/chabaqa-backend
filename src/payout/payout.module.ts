import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PayoutController } from './payout.controller';
import { PayoutService } from './payout.service';
import { Payout, PayoutSchema } from '../schema/payout.schema';
import { User, UserSchema } from '../schema/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Payout.name, schema: PayoutSchema },
      { name: User.name, schema: UserSchema }
    ])
  ],
  controllers: [PayoutController],
  providers: [PayoutService],
  exports: [PayoutService]
})
export class PayoutModule {}