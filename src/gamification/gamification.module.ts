import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CommunityGamificationConfig,
  CommunityGamificationConfigSchema,
} from '../schema/community-gamification-config.schema';
import {
  CommunityMemberGamification,
  CommunityMemberGamificationSchema,
} from '../schema/community-member-gamification.schema';
import {
  GamificationEvent,
  GamificationEventSchema,
} from '../schema/gamification-event.schema';
import { User, UserSchema } from '../schema/user.schema';
import { Community, CommunitySchema } from '../schema/community.schema';
import { GamificationService } from './gamification.service';
import { GamificationController } from './gamification.controller';
import { GamificationScheduler } from './gamification.scheduler';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CommunityGamificationConfig.name, schema: CommunityGamificationConfigSchema },
      { name: CommunityMemberGamification.name, schema: CommunityMemberGamificationSchema },
      { name: GamificationEvent.name, schema: GamificationEventSchema },
      { name: User.name, schema: UserSchema },
      { name: Community.name, schema: CommunitySchema },
    ]),
  ],
  controllers: [GamificationController],
  providers: [GamificationService, GamificationScheduler],
  exports: [GamificationService],
})
export class GamificationModule {}
