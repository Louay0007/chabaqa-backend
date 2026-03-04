import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CourseEnrollmentController } from './course-enrollment.controller';
import { CourseEnrollmentService } from './course-enrollment.service';
import { CourseEnrollment, CourseEnrollmentSchema } from '../schema/course.schema';
import { Cours, CoursSchema } from '../schema/course.schema';
import { User, UserSchema } from '../schema/user.schema';
import { AchievementModule } from '../achievement/achievement.module';
import { TrackingModule } from '../common/modules/tracking.module';
import { ChapterAccessModule } from '../common/modules/chapter-access.module';
import { AnalyticsDaily, AnalyticsDailySchema } from '../schema/analytics-daily.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CourseEnrollment.name, schema: CourseEnrollmentSchema },
      { name: Cours.name, schema: CoursSchema },
      { name: User.name, schema: UserSchema },
      { name: AnalyticsDaily.name, schema: AnalyticsDailySchema }
    ]),
    AchievementModule,
    TrackingModule,
    ChapterAccessModule
  ],
  controllers: [CourseEnrollmentController],
  providers: [CourseEnrollmentService],
  exports: [CourseEnrollmentService]
})
export class CourseEnrollmentModule {}
