import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PolicyService } from '../services/policy.service';
import { Subscription, SubscriptionSchema } from '../../schema/subscription.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Subscription.name, schema: SubscriptionSchema },
    ]),
  ],
  providers: [PolicyService],
  exports: [PolicyService],
})
export class PolicyModule {}


