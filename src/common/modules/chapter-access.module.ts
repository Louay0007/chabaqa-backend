import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Cours,
  CoursSchema,
  CourseEnrollment,
  CourseEnrollmentSchema,
} from '../../schema/course.schema';
import { Order, OrderSchema } from '../../schema/order.schema';
import { ChapterAccessService } from '../services/chapter-access.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Cours.name, schema: CoursSchema },
      { name: CourseEnrollment.name, schema: CourseEnrollmentSchema },
      { name: Order.name, schema: OrderSchema },
    ]),
  ],
  providers: [ChapterAccessService],
  exports: [ChapterAccessService],
})
export class ChapterAccessModule {}
