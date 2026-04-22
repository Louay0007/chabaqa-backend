// src/app.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SeedTunisianUsers } from './common/scripts/seed-tunisian-users';
import { User, UserSchema } from './schema/user.schema';
import { VerificationCode, VerificationCodeSchema } from './schema/verification-code.schema';
import { RevokedToken, RevokedTokenSchema } from './schema/revoked-token.schema';
import { Payout, PayoutSchema } from './schema/payout.schema';
import { UserService } from './user/user.service';
import { UserController } from './user/user.controller';
import { AuthModule } from './auth/auth.module';
import { EmailService } from './common/services/email.service';
import { Community, CommunitySchema } from './schema/community.schema';
import { ResourceModule } from './resource/resource.module';
import { AdminModule } from './admin/admin.module';
import { UploadModule } from './upload/upload.module';
import { MediaModule } from './media/media.module';
import { ChallengeModule } from './challenge/challenge.module';
import { PolicyModule } from './common/modules/policy.module';
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
import { AnalyticsModule } from './analytics/analytics.module';
import { EmailModule } from './email/email.module';
import { FeedbackModule } from './feedback/feedback.module';
import { EmailCampaignModule } from './email-campaign/email-campaign.module';
import { GoogleCalendarModule } from './google-calendar/google-calendar.module';
import { SecurityModule } from './common/modules/security.module';
import { MonitoringModule } from './common/modules/monitoring.module';
import { CacheModule } from './common/modules/cache.module';
import { Achievement, AchievementSchema } from './schema/achievement.schema';
import { UserAchievement, UserAchievementSchema } from './schema/user-achievement.schema';
import { ManualPaymentService } from './common/services/manual-payment.service';
import { AiModule } from './ai/ai.module';
import { Ga4Module } from './ga4/ga4.module';
import { LearningDomainModule } from './domains/learning-domain.module';
import { CommerceDomainModule } from './domains/commerce-domain.module';
import { CommunityDomainModule } from './domains/community-domain.module';
import { LearningPathModule } from './learning-path/learning-path.module';
import { CommunityInvitationModule } from './community-invitation/community-invitation.module';
import { AffiliateModule } from './affiliate/affiliate.module';
import { CommunityAccessModule } from './community-access/community-access.module';
import { VideoModule } from './video/video.module';

// Import new admin schemas
import { AdminUser, AdminUserSchema } from './admin/schemas/admin-user.schema';
import { AuditLog, AuditLogSchema } from './admin/schemas/audit-log.schema';
import { ContentModerationQueue, ContentModerationQueueSchema } from './admin/schemas/content-moderation-queue.schema';
import { ChallengeSubmission, ChallengeSubmissionSchema } from './schema/challenge-submission.schema';
import { ProcessedWebhookEvent, ProcessedWebhookEventSchema } from './schema/processed-webhook-event.schema';
import { PaymentAuditLog, PaymentAuditLogSchema } from './schema/payment-audit-log.schema';

@Module({
  imports: [
    // 1) charge .env globalement
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),

    // 2) Configuration pour servir les fichiers statiques
    // NOTE: Video files are served via X-Accel-Redirect through VideoModule.
    // ServeStaticModule only serves images, documents, and audio.
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
      serveStaticOptions: {
        index: false,
      },
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
      { name: ChallengeSubmission.name, schema: ChallengeSubmissionSchema },
      { name: ProcessedWebhookEvent.name, schema: ProcessedWebhookEventSchema },
      { name: PaymentAuditLog.name, schema: PaymentAuditLogSchema },
    ]),
    AuthModule,
    CommunityDomainModule,
    ResourceModule,
    EmailModule,
    CommerceDomainModule,
    AdminModule,
    LearningDomainModule,
    UploadModule,
    MediaModule,
    ChallengeModule,
    PolicyModule,
    AnalyticsModule,
    FeedbackModule,
    EmailCampaignModule,
    GoogleCalendarModule,
    SecurityModule,
    MonitoringModule,
    CacheModule,
    AiModule,
    LearningPathModule,
    Ga4Module,
    CommunityInvitationModule,
    AffiliateModule,
    CommunityAccessModule,
    VideoModule,
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
    SeedTunisianUsers,
  ],
  exports: [EmailService],
})
export class AppModule { }
