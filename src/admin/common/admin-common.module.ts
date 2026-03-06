import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

// Import schemas
import { AuditLog, AuditLogSchema } from '../schemas/audit-log.schema';
import { AdminUser, AdminUserSchema } from '../schemas/admin-user.schema';
import { User, UserSchema } from '../../schema/user.schema';
import { Admin, AdminSchema } from '../../schema/admin.schema';
import { Community, CommunitySchema } from '../../schema/community.schema';
import { Order, OrderSchema } from '../../schema/order.schema';
import { Subscription, SubscriptionSchema } from '../../schema/subscription.schema';
import { Cours, CoursSchema } from '../../schema/course.schema';
import { Post, PostSchema } from '../../schema/post.schema';
import { Event, EventSchema } from '../../schema/event.schema';
import { Product, ProductSchema } from '../../schema/product.schema';
import {
  UserLoginActivity,
  UserLoginActivitySchema,
} from '../../schema/user-login-activity.schema';

// Import common services (only those without external dependencies)
import { AuditLogService } from './services/audit-log.service';
import { ExportService } from './services/export.service';
import { AnalyticsService } from './services/analytics.service';
import { SecurityMonitoringService } from './services/security-monitoring.service';

// Import guards
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { AdminRolesGuard } from './guards/admin-roles.guard';

/**
 * AdminCommonModule provides shared admin-specific services and guards
 * for all admin sub-modules. This is a global module to avoid circular dependencies.
 * 
 * Services with external dependencies (AdminNotificationService, AdminWebSocketService, 
 * AdminIntegrationService) are provided in the main AdminModule.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: AdminUser.name, schema: AdminUserSchema },
      { name: User.name, schema: UserSchema },
      { name: Admin.name, schema: AdminSchema },
      { name: Community.name, schema: CommunitySchema },
      { name: Order.name, schema: OrderSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: Cours.name, schema: CoursSchema },
      { name: Post.name, schema: PostSchema },
      { name: Event.name, schema: EventSchema },
      { name: Product.name, schema: ProductSchema },
      { name: UserLoginActivity.name, schema: UserLoginActivitySchema },
    ]),
  ],
  providers: [
    // Admin-specific services (no external dependencies)
    AuditLogService,
    ExportService,
    AnalyticsService,
    SecurityMonitoringService,
    
    // Guards
    AdminAuthGuard,
    AdminRolesGuard,
  ],
  exports: [
    // Export admin services
    AuditLogService,
    ExportService,
    AnalyticsService,
    SecurityMonitoringService,
    AdminAuthGuard,
    AdminRolesGuard,
    
    // Export MongooseModule for schemas
    MongooseModule,
  ],
})
export class AdminCommonModule {}
