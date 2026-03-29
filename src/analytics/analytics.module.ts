import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalyticsDaily, AnalyticsDailySchema } from '../schema/analytics-daily.schema';
import { AnalyticsRetention, AnalyticsRetentionSchema } from '../schema/analytics-retention.schema';
import { AnalyticsWeeklyReport, AnalyticsWeeklyReportSchema } from '../schema/analytics-weekly-report.schema';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { SubscriptionModule } from '../subscription/subscription.module';
import { PolicyModule } from '../common/modules/policy.module';
import { CoursSchema, CourseEnrollmentSchema } from '../schema/course.schema';
import { Subscription, SubscriptionSchema } from '../schema/subscription.schema';
import { AnalyticsScheduler } from './analytics.scheduler';
import { CreatorInsightsService } from './creator-insights.service';

@Global()
@Module({
  imports: [
    SubscriptionModule,
    PolicyModule,
    MongooseModule.forFeature([
      { name: AnalyticsDaily.name, schema: AnalyticsDailySchema },
      { name: 'Cours', schema: CoursSchema },
      { name: 'CourseEnrollment', schema: CourseEnrollmentSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: AnalyticsRetention.name, schema: AnalyticsRetentionSchema },
      { name: AnalyticsWeeklyReport.name, schema: AnalyticsWeeklyReportSchema },
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsScheduler, CreatorInsightsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule { }


