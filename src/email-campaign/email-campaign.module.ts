import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EmailCampaign, EmailCampaignSchema } from '../schema/email-campaign.schema';
import { User, UserSchema } from '../schema/user.schema';
import { Community, CommunitySchema } from '../schema/community.schema';
import { EmailCampaignController } from './email-campaign.controller';
import { EmailCampaignService } from './email-campaign.service';
import { UserLoginActivityModule } from '../user-login-activity/user-login-activity.module';
import { EmailService } from '../common/services/email.service';
import { EmailCampaignQueueService } from './email-campaign.queue';
import { EmailCampaignProcessor } from './email-campaign.processor';

/**
 * Module for managing email campaigns including inactive user targeting
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: EmailCampaign.name, schema: EmailCampaignSchema },
      { name: User.name, schema: UserSchema },
      { name: Community.name, schema: CommunitySchema },
    ]),
    UserLoginActivityModule,
  ],
  controllers: [EmailCampaignController],
  providers: [EmailCampaignService, EmailCampaignQueueService, EmailCampaignProcessor, EmailService],
  exports: [EmailCampaignService, EmailCampaignQueueService],
})
export class EmailCampaignModule {}
