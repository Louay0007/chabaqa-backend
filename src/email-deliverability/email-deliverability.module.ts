import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EmailDeliverabilitySnapshot, EmailDeliverabilitySnapshotSchema } from '../schema/email-deliverability.schema';
import { EmailDeliverabilityService } from './email-deliverability.service';
import { EmailDeliverabilityController } from './email-deliverability.controller';
import { PolicyModule } from '../common/modules/policy.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: EmailDeliverabilitySnapshot.name, schema: EmailDeliverabilitySnapshotSchema },
    ]),
    PolicyModule,
  ],
  controllers: [EmailDeliverabilityController],
  providers: [EmailDeliverabilityService],
  exports: [EmailDeliverabilityService],
})
export class EmailDeliverabilityModule {}
