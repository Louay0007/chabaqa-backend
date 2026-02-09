import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { CoursController } from './cours.controller';
import { CoursService } from './cours.service';
import { CoursSchema, CourseEnrollmentSchema, CourseProgressSchema } from '../schema/course.schema';
import { UserCourseNote, UserCourseNoteSchema } from '../schema/user-course-note.schema';
import { CommunitySchema } from '../schema/community.schema';
import { UserSchema } from '../schema/user.schema';
import { OrderSchema } from '../schema/order.schema';
import { ContentProgressSchema } from '../schema/content-tracking.schema';
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
      { name: UserCourseNote.name, schema: UserCourseNoteSchema },
      { name: 'Community', schema: CommunitySchema },
      { name: 'User', schema: UserSchema },
      { name: 'Order', schema: OrderSchema },
      { name: 'ContentProgress', schema: ContentProgressSchema }
    ]),
    MulterModule.register({
      storage: diskStorage({
        destination: (req, file, cb) => {
          const extension = extname(file.originalname).toLowerCase();
          let folder = 'uploads';
          if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(extension)) {
            folder = 'uploads/image';
          } else if (['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm'].includes(extension)) {
            folder = 'uploads/video';
          } else if (['.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt'].includes(extension)) {
            folder = 'uploads/document';
          } else if (['.mp3', '.wav', '.ogg', '.aac', '.flac'].includes(extension)) {
            folder = 'uploads/audio';
          }
          cb(null, folder);
        },
        filename: (req, file, cb) => {
          const extension = extname(file.originalname);
          const uuid = uuidv4();
          const timestamp = Date.now();
          cb(null, `${timestamp}-${uuid}${extension}`);
        }
      }),
      limits: {
        fileSize: 500 * 1024 * 1024, // 500MB max
      },
    }),
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