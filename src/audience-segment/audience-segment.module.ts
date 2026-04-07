import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AudienceSegment, AudienceSegmentSchema } from '../schema/audience-segment.schema';
import { UserLoginActivity, UserLoginActivitySchema } from '../schema/user-login-activity.schema';
import { OrderSchema } from '../schema/order.schema';
import { AudienceSegmentService } from './audience-segment.service';
import { AudienceSegmentController } from './audience-segment.controller';
import { PolicyModule } from '../common/modules/policy.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AudienceSegment.name, schema: AudienceSegmentSchema },
      { name: UserLoginActivity.name, schema: UserLoginActivitySchema },
      { name: 'Order', schema: OrderSchema },
    ]),
    PolicyModule,
  ],
  controllers: [AudienceSegmentController],
  providers: [AudienceSegmentService],
  exports: [AudienceSegmentService],
})
export class AudienceSegmentModule {}
