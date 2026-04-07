import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConsentRecord, ConsentRecordSchema } from '../schema/consent-record.schema';
import { VerificationCode, VerificationCodeSchema } from '../schema/verification-code.schema';
import { User, UserSchema } from '../schema/user.schema';
import { GdprService } from './gdpr.service';
import { GdprController } from './gdpr.controller';
import { DataRetentionScheduler } from './data-retention.scheduler';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ConsentRecord.name, schema: ConsentRecordSchema },
      { name: VerificationCode.name, schema: VerificationCodeSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [GdprController],
  providers: [GdprService, DataRetentionScheduler],
  exports: [GdprService],
})
export class GdprModule {}
