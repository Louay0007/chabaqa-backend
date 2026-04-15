// src/app.module.ts — Landing Pages & Funnels modules registered
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { User, UserSchema } from './schema/user.schema';
import {
  VerificationCode,
  VerificationCodeSchema,
} from './schema/verification-code.schema';
import {
  RevokedToken,
  RevokedTokenSchema,
} from './schema/revoked-token.schema';
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
import {
  CourseEnrollmentSchema,
  CourseProgressSchema,
} from './schema/course.schema';
import {
  StorageUsage,
  StorageUsageSchema,
} from './schema/storage-usage.schema';
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
import {
  UserAchievement,
  UserAchievementSchema,
} from './schema/user-achievement.schema';
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
import { TranscriptionModule } from './transcription/transcription.module';
import { PaymentMethodModule } from './payment-methods/payment-method.module';
import { PromoCodeModule } from './promo-code/promo-code.module';
// Import new admin schemas
import { AdminUser, AdminUserSchema } from './admin/schemas/admin-user.schema';
import { AuditLog, AuditLogSchema } from './admin/schemas/audit-log.schema';
import {
  ContentModerationQueue,
  ContentModerationQueueSchema,
} from './admin/schemas/content-moderation-queue.schema';
import {
  ChallengeSubmission,
  ChallengeSubmissionSchema,
} from './schema/challenge-submission.schema';
import {
  ProcessedWebhookEvent,
  ProcessedWebhookEventSchema,
} from './schema/processed-webhook-event.schema';
import {
  PaymentAuditLog,
  PaymentAuditLogSchema,
} from './schema/payment-audit-log.schema';
import { LandingPagesModule } from './landing-pages/landing-pages.module';
import { FunnelsModule } from './funnels/funnels.module';
import { GamificationModule } from './gamification/gamification.module';
import { AutomationWorkflowModule } from './automation-workflow/automation-workflow.module';
import { GdprModule } from './gdpr/gdpr.module';
import { ContactActivityModule } from './contact-activity/contact-activity.module';
import { ContactProfileModule } from './contact-profile/contact-profile.module';
import { EmailSuppressionModule } from './email-suppression/email-suppression.module';
import { EmailDeliverabilityModule } from './email-deliverability/email-deliverability.module';
import { AudienceSegmentModule } from './audience-segment/audience-segment.module';
import { EmailTemplateModule } from './email-template/email-template.module';
import { ContactImportModule } from './contact-import/contact-import.module';
import {
  ConsentRecord,
  ConsentRecordSchema,
} from './schema/consent-record.schema';
import { UserSession, UserSessionSchema } from './schema/user-session.schema';
import { SSOModule } from './sso/sso.module';
import { DataResidencyModule } from './data-residency/data-residency.module';

@Module({
  imports: [
    // 1) charge .env globalement
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
      serveStaticOptions: {
        index: false,
      },
    }),
    MongooseModule.forRootAsync({
      useFactory: () => ({
        uri: process.env.MONGO_URI,
        serverSelectionTimeoutMS: 30000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 30000,
        connectionFactory: (connection) => {
          connection.on('connected', async () => {
            console.log('✅ MongoDB connected!');
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
      { name: AdminUser.name, schema: AdminUserSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
      {
        name: ContentModerationQueue.name,
        schema: ContentModerationQueueSchema,
      },
      { name: ChallengeSubmission.name, schema: ChallengeSubmissionSchema },
      { name: ProcessedWebhookEvent.name, schema: ProcessedWebhookEventSchema },
      { name: PaymentAuditLog.name, schema: PaymentAuditLogSchema },
      { name: ConsentRecord.name, schema: ConsentRecordSchema },
      { name: UserSession.name, schema: UserSessionSchema },
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
    TranscriptionModule,
    PaymentMethodModule,
    PromoCodeModule,
    LandingPagesModule,
    FunnelsModule,
    GamificationModule,
    AutomationWorkflowModule,
    GdprModule,
    EmailSuppressionModule,
    EmailDeliverabilityModule,
    ContactActivityModule,
    ContactProfileModule,
    AudienceSegmentModule,
    EmailTemplateModule,
    ContactImportModule,
    SSOModule,
    DataResidencyModule,
  ],
  controllers: [
    AppController,
    UserController,
    TrackingController,
    PaymentController,
  ],
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
export class AppModule {}
