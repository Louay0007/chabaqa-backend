import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EmailSuppression, EmailSuppressionSchema } from '../schema/email-suppression.schema';
import { EmailSuppressionService } from './email-suppression.service';
import { EmailSuppressionController } from './email-suppression.controller';
import { PolicyModule } from '../common/modules/policy.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: EmailSuppression.name, schema: EmailSuppressionSchema },
    ]),
    PolicyModule,
  ],
  controllers: [EmailSuppressionController],
  providers: [EmailSuppressionService],
  exports: [EmailSuppressionService],
})
export class EmailSuppressionModule {}
