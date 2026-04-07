import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MulterModule } from '@nestjs/platform-express';
import { Lead, LeadSchema } from '../schema/lead.schema';
import { UserLoginActivity, UserLoginActivitySchema } from '../schema/user-login-activity.schema';
import { User, UserSchema } from '../schema/user.schema';
import { ContactImportController } from './contact-import.controller';
import { EmailSuppressionModule } from '../email-suppression/email-suppression.module';
import { ContactActivityModule } from '../contact-activity/contact-activity.module';
import { PolicyModule } from '../common/modules/policy.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Lead.name, schema: LeadSchema },
      { name: UserLoginActivity.name, schema: UserLoginActivitySchema },
      { name: User.name, schema: UserSchema },
    ]),
    MulterModule.register({ limits: { fileSize: 10 * 1024 * 1024 } }),
    EmailSuppressionModule,
    ContactActivityModule,
    PolicyModule,
  ],
  controllers: [ContactImportController],
})
export class ContactImportModule {}
