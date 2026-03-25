import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PolicyService } from '../services/policy.service';
import { Subscription, SubscriptionSchema } from '../../schema/subscription.schema';
import { Plan, PlanSchema } from '../../schema/plan.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: Plan.name, schema: PlanSchema },
    ]),
  ],
  providers: [PolicyService],
  exports: [PolicyService],
})
export class PolicyModule {}


