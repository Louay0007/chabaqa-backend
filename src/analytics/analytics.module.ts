import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalyticsDaily, AnalyticsDailySchema } from '../schema/analytics-daily.schema';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { SubscriptionModule } from '../subscription/subscription.module';
import { CoursSchema, CourseEnrollmentSchema } from '../schema/course.schema';
import { Subscription, SubscriptionSchema } from '../schema/subscription.schema';
import { AnalyticsScheduler } from './analytics.scheduler';

@Global()
@Module({
  imports: [
    SubscriptionModule,
    MongooseModule.forFeature([
      { name: AnalyticsDaily.name, schema: AnalyticsDailySchema },
      { name: 'Cours', schema: CoursSchema },
      { name: 'CourseEnrollment', schema: CourseEnrollmentSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsScheduler],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}


