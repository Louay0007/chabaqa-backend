import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ContentManagementController } from './content-management.controller';
import { ContentManagementService } from './content-management.service';
import { Cours, CoursSchema } from '../../schema/course.schema';
import { Challenge, ChallengeSchema } from '../../schema/challenge.schema';
import { ChallengeSubmission, ChallengeSubmissionSchema } from '../../schema/challenge-submission.schema';
import { Event, EventSchema } from '../../schema/event.schema';
import { Post, PostSchema } from '../../schema/post.schema';
import { Community, CommunitySchema } from '../../schema/community.schema';
import { User, UserSchema } from '../../schema/user.schema';
import { CourseEnrollment, CourseEnrollmentSchema } from '../../schema/course.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Cours.name, schema: CoursSchema },
      { name: Challenge.name, schema: ChallengeSchema },
      { name: ChallengeSubmission.name, schema: ChallengeSubmissionSchema },
      { name: Event.name, schema: EventSchema },
      { name: Post.name, schema: PostSchema },
      { name: Community.name, schema: CommunitySchema },
      { name: User.name, schema: UserSchema },
      { name: CourseEnrollment.name, schema: CourseEnrollmentSchema },
    ]),
  ],
  controllers: [ContentManagementController],
  providers: [ContentManagementService],
  exports: [ContentManagementService],
})
export class ContentManagementModule {}
