import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SecurityAuditController } from './security-audit.controller';
import { SecurityAuditService } from './security-audit.service';

// Import schemas
import { AuditLog, AuditLogSchema } from '../schemas/audit-log.schema';
import { AdminUser, AdminUserSchema } from '../schemas/admin-user.schema';

/**
 * Security audit module for security monitoring and audit trail management
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: AdminUser.name, schema: AdminUserSchema },
    ]),
  ],
  controllers: [SecurityAuditController],
  providers: [
    SecurityAuditService,
    // Note: SecurityMonitoringService, AdminNotificationService, AuditLogService, and EmailService
    // are provided by the parent AdminModule and AdminCommonModule
  ],
  exports: [
    SecurityAuditService,
  ],
})
export class SecurityAuditModule {}