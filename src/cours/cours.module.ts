import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CoursController } from './cours.controller';
import { CoursService } from './cours.service';
import { CoursSchema, CourseEnrollmentSchema, CourseProgressSchema } from '../schema/course.schema';
import { CommunitySchema } from '../schema/community.schema';
import { UserSchema } from '../schema/user.schema';
import { OrderSchema } from '../schema/order.schema';
import { UploadModule } from '../upload/upload.module';
import { TrackingModule } from '../common/modules/tracking.module';
import { PolicyModule } from '../common/modules/policy.module';
import { FeeModule } from '../common/modules/fee.module';
import { PromoModule } from '../common/modules/promo.module';
import { AchievementModule } from '../achievement/achievement.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Cours', schema: CoursSchema },
      { name: 'CourseEnrollment', schema: CourseEnrollmentSchema },
      { name: 'CourseProgress', schema: CourseProgressSchema },
      { name: 'Community', schema: CommunitySchema },
      { name: 'User', schema: UserSchema },
      { name: 'Order', schema: OrderSchema }
    ]),
    UploadModule,
    TrackingModule,
    PolicyModule,
    FeeModule,
    PromoModule,
    AchievementModule
  ],
  controllers: [CoursController],
  providers: [CoursService],
  exports: [CoursService]
})
export class CoursModule {} 