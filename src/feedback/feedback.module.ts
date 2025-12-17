
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
import { Feedback, FeedbackSchema } from '../schema/feedback.schema';
import { Community, CommunitySchema } from '../schema/community.schema';
import { CoursSchema } from '../schema/course.schema';
import { Challenge, ChallengeSchema } from '../schema/challenge.schema';
import { Event, EventSchema } from '../schema/event.schema';
import { Product, ProductSchema } from '../schema/product.schema';
import { Session, SessionSchema } from '../schema/session.schema';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Feedback.name, schema: FeedbackSchema },
      { name: Community.name, schema: CommunitySchema },
      { name: 'Cours', schema: CoursSchema },
      { name: Challenge.name, schema: ChallengeSchema },
      { name: Event.name, schema: EventSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Session.name, schema: SessionSchema },
    ]),
    AuthModule,
  ],
  controllers: [FeedbackController],
  providers: [FeedbackService],
})
export class FeedbackModule {}
