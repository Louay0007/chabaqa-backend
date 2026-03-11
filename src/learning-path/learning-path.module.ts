import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { LearningPathController } from './learning-path.controller';
import { LearningPathService } from './learning-path.service';
import { LearningPathAiService } from './learning-path-ai.service';
import {
  LearningPathRecommendation,
  LearningPathRecommendationSchema,
} from '../schema/learning-path-recommendation.schema';
import { Cours, CoursSchema, CourseEnrollmentSchema } from '../schema/course.schema';
import { Challenge, ChallengeSchema } from '../schema/challenge.schema';
import { Resource, ResourceSchema } from '../schema/resource.schema';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: LearningPathRecommendation.name, schema: LearningPathRecommendationSchema },
      { name: 'CourseEnrollment', schema: CourseEnrollmentSchema },
      { name: Cours.name, schema: CoursSchema },
      { name: Challenge.name, schema: ChallengeSchema },
      { name: Resource.name, schema: ResourceSchema },
    ]),
  ],
  controllers: [LearningPathController],
  providers: [LearningPathService, LearningPathAiService],
})
export class LearningPathModule {}
