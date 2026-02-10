import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ContentTrackingService } from '../services/content-tracking.service';
import { 
  ContentProgress, 
  ContentProgressSchema, 
  TrackingAction, 
  TrackingActionSchema 
} from '../../schema/content-tracking.schema';
import { Cours, CoursSchema } from '../../schema/course.schema';
import { Challenge, ChallengeSchema } from '../../schema/challenge.schema';
import { Session, SessionSchema } from '../../schema/session.schema';
import { Event, EventSchema } from '../../schema/event.schema';
import { Product, ProductSchema } from '../../schema/product.schema';
import { Post, PostSchema } from '../../schema/post.schema';
import { Ga4Module } from '../../ga4/ga4.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'ContentProgress', schema: ContentProgressSchema },
      { name: 'TrackingAction', schema: TrackingActionSchema },
      { name: Cours.name, schema: CoursSchema },
      { name: Challenge.name, schema: ChallengeSchema },
      { name: Session.name, schema: SessionSchema },
      { name: Event.name, schema: EventSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Post.name, schema: PostSchema },
    ]),
    Ga4Module
  ],
  providers: [ContentTrackingService],
  exports: [ContentTrackingService, MongooseModule]
})
export class TrackingModule {}
