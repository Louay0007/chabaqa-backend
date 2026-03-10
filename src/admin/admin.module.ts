import { Module, NestModule, MiddlewareConsumer, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminNotificationsService } from './admin-notifications.service';

// Import existing schemas
import { Admin, AdminSchema } from '../schema/admin.schema';
import { User, UserSchema } from '../schema/user.schema';
import { VerificationCode, VerificationCodeSchema } from '../schema/verification-code.schema';
import { RevokedToken, RevokedTokenSchema } from '../schema/revoked-token.schema';

// Import schemas for AnalyticsService
import { Community, CommunitySchema } from '../schema/community.schema';
import { Order, OrderSchema } from '../schema/order.schema';
import { Subscription, SubscriptionSchema } from '../schema/subscription.schema';
import { Cours, CoursSchema } from '../schema/course.schema';
import { Conversation, ConversationSchema } from '../schema/conversation.schema';

// Import new admin-specific schemas
import { AdminUser, AdminUserSchema } from './schemas/admin-user.schema';
import { AuditLog, AuditLogSchema } from './schemas/audit-log.schema';
import { ContentModerationQueue, ContentModerationQueueSchema } from './schemas/content-moderation-queue.schema';

// Import common services
import { TokenBlacklistService } from '../common/services/token-blacklist.service';
import { EmailService } from '../common/services/email.service';

// Import required modules for integration (these are now global)
import { AuthModule } from '../auth/auth.module';
import { UploadModule } from '../upload/upload.module';
import { DmModule } from '../dm/dm.module';
import { EmailModule } from '../email/email.module';
import { PaymentModule } from '../common/modules/payment.module';

// Import admin common module
import { AdminCommonModule } from './common/admin-common.module';

// Import admin services that need external dependencies
import { AdminNotificationService } from './common/services/admin-notification.service';
import { AdminIntegrationService } from './common/services/admin-integration.service';
import { AdminWebSocketService } from './common/services/admin-websocket.service';

// Import admin middleware
import { AuditLogMiddleware } from './common/middleware/audit-log.middleware';

// Import admin interceptors and filters
import { AdminResponseInterceptor } from './common/interceptors/admin-response.interceptor';
import { AdminExceptionFilter } from './common/filters/admin-exception.filter';
import { AdminRateLimitGuard } from './common/guards/admin-rate-limit.guard';

// Import admin modules
import { SecurityAuditModule } from './security-audit/security-audit.module';
import { UserManagementModule } from './user-management/user-management.module';
import { CommunityManagementModule } from './community-management/community-management.module';
import { ContentModerationModule } from './content-moderation/content-moderation.module';
import { FinancialManagementModule } from './financial-management/financial-management.module';
import { AnalyticsDashboardModule } from './analytics-dashboard/analytics-dashboard.module';
import { AdminAlertConfig, AdminAlertConfigSchema } from './analytics-dashboard/schemas/admin-alert-config.schema';

// Import admin controllers
import { ExportController } from './common/controllers/export.controller';
import { AnalyticsController } from './common/controllers/analytics.controller';

/**
 * Enhanced Admin Module for comprehensive platform administration
 * Provides role-based access control, audit logging, and administrative functionality
 */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      // Existing admin schemas
      { name: Admin.name, schema: AdminSchema },
      { name: User.name, schema: UserSchema },
      { name: VerificationCode.name, schema: VerificationCodeSchema },
      { name: RevokedToken.name, schema: RevokedTokenSchema },
      
      // Additional schemas for AnalyticsService
      { name: Community.name, schema: CommunitySchema },
      { name: Order.name, schema: OrderSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: Cours.name, schema: CoursSchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: AdminAlertConfig.name, schema: AdminAlertConfigSchema },

      // New admin-specific schemas
      { name: AdminUser.name, schema: AdminUserSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: ContentModerationQueue.name, schema: ContentModerationQueueSchema },
    ]),
    ConfigModule,
    
    // Import required modules for integration (these are now global)
    AuthModule,
    UploadModule,
    DmModule,
    EmailModule,
    PaymentModule,
    
    // Import admin common module (provides shared services)
    AdminCommonModule,
    
    // Configure rate limiting for admin module
    ThrottlerModule.forRoot([
      {
        name: 'admin-default',
        ttl: 60000, // 60 seconds
        limit: 1000, // 1000 requests per minute
      },
      {
        name: 'admin-strict',
        ttl: 60000, // 60 seconds
        limit: 200, // 200 requests per minute for sensitive operations
      },
      {
        name: 'admin-bulk',
        ttl: 60000, // 60 seconds
        limit: 50, // 50 requests per minute for bulk operations
      },
    ]),
    
    // Import admin sub-modules
    SecurityAuditModule,
    UserManagementModule,
    CommunityManagementModule,
    ContentModerationModule,
    FinancialManagementModule,
    AnalyticsDashboardModule,
  ],
  controllers: [AdminController, ExportController, AnalyticsController],
  providers: [
    // Core admin services
    AdminService,
    AdminNotificationsService,
    TokenBlacklistService,
    EmailService, // Provide EmailService from common/services for AdminService
    
    // Services with external dependencies (provided here where deps are available)
    AdminNotificationService,
    AdminWebSocketService,
    AdminIntegrationService,
    
    // Admin middleware
    AuditLogMiddleware,
    
    // Global admin interceptor for consistent responses
    {
      provide: APP_INTERCEPTOR,
      useClass: AdminResponseInterceptor,
    },
    
    // Global admin exception filter for consistent error handling
    {
      provide: APP_FILTER,
      useClass: AdminExceptionFilter,
    },
    
    // Global rate limiting guard for admin endpoints
    {
      provide: APP_GUARD,
      useClass: AdminRateLimitGuard,
    },
  ],
  exports: [
    AdminService,
    AdminNotificationsService,
    AdminCommonModule,
    // Export services that other modules might need
    AdminNotificationService,
    AdminWebSocketService,
    AdminIntegrationService,
  ]
})
export class AdminModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AuditLogMiddleware)
      .forRoutes('admin/*'); // Apply to all admin routes
  }
}
