// src/app.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { User, UserSchema } from './schema/user.schema';
import { VerificationCode, VerificationCodeSchema } from './schema/verification-code.schema';
import { RevokedToken, RevokedTokenSchema } from './schema/revoked-token.schema';
import { Payout, PayoutSchema } from './schema/payout.schema';
import { UserService } from './user/user.service';
import { UserController } from './user/user.controller';
import { PayoutModule } from './payout/payout.module';
import { AuthModule } from './auth/auth.module';
import { EmailService } from './common/services/email.service';
import { CommunityAffCreaJoinModule } from './community-aff-crea-join/community-aff-crea-join.module';
import { Community, CommunitySchema } from './schema/community.schema';
import { ResourceModule } from './resource/resource.module';
import { AdminModule } from './admin/admin.module';
import { CoursModule } from './cours/cours.module';
import { UploadModule } from './upload/upload.module';
import { CourseEnrollmentModule } from './course-enrollment/course-enrollment.module';
import { ProductModule } from './product/product.module';
import { ChallengeModule } from './challenge/challenge.module';
import { SessionModule } from './session/session.module';
import { PostModule } from './post/post.module';
import { EventModule } from './event/event.module';
import { TrackingModule } from './common/modules/tracking.module';
import { PolicyModule } from './common/modules/policy.module';
import { FeeModule } from './common/modules/fee.module';
import { PromoModule } from './common/modules/promo.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { StripePaymentService } from './common/services/stripe-payment.service';
import { FlouciPaymentService } from './common/services/flouci-payment.service';
import { PromoService } from './common/services/promo.service';
import { FeeService } from './common/services/fee.service';
import { PromoCode, PromoCodeSchema } from './schema/promo-code.schema';
import { Subscription, SubscriptionSchema } from './schema/subscription.schema';
import { CourseEnrollmentSchema, CourseProgressSchema } from './schema/course.schema';
import { StorageUsage, StorageUsageSchema } from './schema/storage-usage.schema';
import { TrackingController } from './common/controllers/tracking.controller';
import { PaymentController } from './common/controllers/payment.controller';
import { Plan, PlanSchema } from './schema/plan.schema';
import { OrderSchema } from './schema/order.schema';
import { CoursSchema } from './schema/course.schema';
import { ChallengeSchema } from './schema/challenge.schema';
import { EventSchema } from './schema/event.schema';
import { ProductSchema } from './schema/product.schema';
import { SessionSchema } from './schema/session.schema';
import { FlouciModule } from './common/modules/flouci.module';
import { DmModule } from './dm/dm.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { EmailModule } from './email/email.module';
import { PaymentModule } from './common/modules/payment.module';
import { FeedbackModule } from './feedback/feedback.module';
import { NotificationModule } from './notification/notification.module';
import { CommunitiesModule } from './communities/communities.module';
import { EmailCampaignModule } from './email-campaign/email-campaign.module';
import { GoogleCalendarModule } from './google-calendar/google-calendar.module';
import { SecurityModule } from './common/modules/security.module';
import { MonitoringModule } from './common/modules/monitoring.module';
import { CacheModule } from './common/modules/cache.module';
import { CommunityPageContentModule } from './community-page-content/community-page-content.module';
import { ProgressionModule } from './progression/progression.module';
import { AchievementModule } from './achievement/achievement.module';
import { Achievement, AchievementSchema } from './schema/achievement.schema';
import { UserAchievement, UserAchievementSchema } from './schema/user-achievement.schema';
import { ManualPaymentService } from './common/services/manual-payment.service';
import { WalletModule } from './wallet/wallet.module';

// Import new admin schemas
import { AdminUser, AdminUserSchema } from './admin/schemas/admin-user.schema';
import { AuditLog, AuditLogSchema } from './admin/schemas/audit-log.schema';
import { ContentModerationQueue, ContentModerationQueueSchema } from './admin/schemas/content-moderation-queue.schema';

@Module({
  imports: [
    // 1) charge .env globalement
    ConfigModule.forRoot({ isGlobal: true }),

    // 2) Configuration pour servir les fichiers statiques
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'),
      serveRoot: '/uploads',
    }),

    // 3) connexion MongoDB + test immédiat
    MongooseModule.forRootAsync({
      useFactory: () => ({
        uri: process.env.MONGO_URI,
        serverSelectionTimeoutMS: 30000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 30000,
        connectionFactory: (connection) => {
          // log OK / KO
          connection.on('connected', async () => {
            console.log('✅ MongoDB connected!');

            /* --- test vivant : lister les collections --- */
            try {
              const cols = await connection.db.listCollections().toArray();
              console.log(
                '📊 MongoDB is alive. Collections:',
                cols.map((c: any) => c.name),
              );
            } catch (err: any) {
              console.error('❌ Test query failed:', err);
            }
          });

          connection.on('error', (err: any) =>
            console.error('❌ MongoDB connection error:', err),
          );

          return connection;
        },
      }),
    }),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: VerificationCode.name, schema: VerificationCodeSchema },
      { name: RevokedToken.name, schema: RevokedTokenSchema },
      { name: Payout.name, schema: PayoutSchema },
      { name: Community.name, schema: CommunitySchema },
      { name: StorageUsage.name, schema: StorageUsageSchema },
      { name: Plan.name, schema: PlanSchema },
      { name: 'Order', schema: OrderSchema },
      { name: 'Cours', schema: CoursSchema },
      { name: 'Challenge', schema: ChallengeSchema },
      { name: 'Event', schema: EventSchema },
      { name: 'Product', schema: ProductSchema },
      { name: 'Session', schema: SessionSchema },
      { name: Achievement.name, schema: AchievementSchema },
      { name: UserAchievement.name, schema: UserAchievementSchema },
      { name: PromoCode.name, schema: PromoCodeSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: 'CourseEnrollment', schema: CourseEnrollmentSchema },
      { name: 'CourseProgress', schema: CourseProgressSchema },
      // New admin schemas
      { name: AdminUser.name, schema: AdminUserSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: ContentModerationQueue.name, schema: ContentModerationQueueSchema },
    ]),
    AuthModule,
    CommunityAffCreaJoinModule,
    ResourceModule,
    EmailModule,
    PaymentModule,
    AdminModule,
    CoursModule,
    UploadModule,
    AchievementModule,
    CourseEnrollmentModule,
    ProductModule,
    ChallengeModule,
    SessionModule,
    PostModule,
    EventModule,
    TrackingModule,
    PolicyModule,
    SubscriptionModule,
    FeeModule,
    PromoModule,
    FlouciModule,
    DmModule,
    AnalyticsModule,
    FeedbackModule,
    NotificationModule,
    CommunitiesModule,
    EmailCampaignModule,
    GoogleCalendarModule,
    SecurityModule,
    MonitoringModule,
    CacheModule,
    CommunityPageContentModule,
    ProgressionModule,
    PayoutModule,
    WalletModule,
  ],
  controllers: [AppController, UserController, TrackingController, PaymentController],
  providers: [
    AppService,
    UserService,
    EmailService,
    StripePaymentService,
    FlouciPaymentService,
    PromoService,
    FeeService,
    ManualPaymentService,
  ],
  exports: [EmailService],
})
export class AppModule { }
