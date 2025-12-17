import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProgressionController } from './progression.controller';
import { ProgressionService } from './progression.service';
import { TrackingModule } from '../common/modules/tracking.module';
import { Cours, CoursSchema } from '../schema/course.schema';
import { Challenge, ChallengeSchema } from '../schema/challenge.schema';
import { Session, SessionSchema } from '../schema/session.schema';
import { Event, EventSchema } from '../schema/event.schema';
import { Product, ProductSchema } from '../schema/product.schema';
import { Post, PostSchema } from '../schema/post.schema';
import { Community, CommunitySchema } from '../schema/community.schema';

@Module({
  imports: [
    TrackingModule,
    MongooseModule.forFeature([
      { name: 'Cours', schema: CoursSchema },
      { name: 'Challenge', schema: ChallengeSchema },
      { name: 'Session', schema: SessionSchema },
      { name: 'Event', schema: EventSchema },
      { name: 'Product', schema: ProductSchema },
      { name: Post.name, schema: PostSchema },
      { name: Community.name, schema: CommunitySchema },
    ]),
  ],
  controllers: [ProgressionController],
  providers: [ProgressionService],
  exports: [ProgressionService],
})
export class ProgressionModule {}

