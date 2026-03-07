import { Module } from '@nestjs/common';
import { CoursDomainModule } from '../cours/cours-domain.module';
import { CourseEnrollmentModule } from '../course-enrollment/course-enrollment.module';
import { AchievementModule } from '../achievement/achievement.module';
import { ProgressionModule } from '../progression/progression.module';
import { TrackingModule } from '../common/modules/tracking.module';

@Module({
  imports: [
    CoursDomainModule,
    CourseEnrollmentModule,
    AchievementModule,
    ProgressionModule,
    TrackingModule,
  ],
  exports: [
    CoursDomainModule,
    CourseEnrollmentModule,
    AchievementModule,
    ProgressionModule,
    TrackingModule,
  ],
})
export class LearningDomainModule {}
