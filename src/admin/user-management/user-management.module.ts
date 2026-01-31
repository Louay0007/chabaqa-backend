import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserManagementController } from './user-management.controller';
import { UserManagementService } from './user-management.service';

// Import schemas
import { User, UserSchema } from '../../schema/user.schema';
import { AdminUser, AdminUserSchema } from '../schemas/admin-user.schema';
import { AuditLog, AuditLogSchema } from '../schemas/audit-log.schema';

// Import common services
import { AuditLogService } from '../common/services/audit-log.service';
import { EmailService } from '../../common/services/email.service';
import { AnalyticsService } from '../common/services/analytics.service';

/**
 * User Management Module for Admin System
 * Provides comprehensive user administration capabilities
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: AdminUser.name, schema: AdminUserSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
    ]),
  ],
  controllers: [UserManagementController],
  providers: [
    UserManagementService,
    AuditLogService,
    EmailService,
    AnalyticsService,
  ],
  exports: [UserManagementService],
})
export class UserManagementModule {}