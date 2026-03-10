import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CommunicationManagementController } from './communication-management.controller';
import { CommunicationManagementService } from './communication-management.service';
import {
  EmailCampaign,
  EmailCampaignSchema,
} from '../../schema/email-campaign.schema';
import { User, UserSchema } from '../../schema/user.schema';
import { Community, CommunitySchema } from '../../schema/community.schema';
import {
  Notification,
  NotificationSchema,
} from '../../schema/notification.schema';
import {
  NotificationConfig,
  NotificationConfigSchema,
} from '../schemas/notification-config.schema';
import {
  EmailTemplate,
  EmailTemplateSchema,
} from '../schemas/email-template.schema';
import { EmailService } from '../../common/services/email.service';
import { NotificationModule } from '../../notification/notification.module';
import { AuditLogService } from '../common/services/audit-log.service';
import { AuditLog, AuditLogSchema } from '../schemas/audit-log.schema';
import { AdminUser, AdminUserSchema } from '../schemas/admin-user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: EmailCampaign.name, schema: EmailCampaignSchema },
      { name: User.name, schema: UserSchema },
      { name: Community.name, schema: CommunitySchema },
      { name: Notification.name, schema: NotificationSchema },
      { name: NotificationConfig.name, schema: NotificationConfigSchema },
      { name: EmailTemplate.name, schema: EmailTemplateSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: AdminUser.name, schema: AdminUserSchema },
    ]),
    NotificationModule,
  ],
  controllers: [CommunicationManagementController],
  providers: [
    CommunicationManagementService,
    EmailService,
    AuditLogService,
  ],
  exports: [CommunicationManagementService],
})
export class CommunicationManagementModule {}
