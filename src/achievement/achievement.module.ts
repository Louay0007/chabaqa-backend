import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Achievement, AchievementSchema } from '../schema/achievement.schema';
import { UserAchievement, UserAchievementSchema } from '../schema/user-achievement.schema';
import { Community, CommunitySchema } from '../schema/community.schema';
import { AchievementService } from './achievement.service';
import { AchievementController } from './achievement.controller';
import { ProgressionModule } from '../progression/progression.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Achievement.name, schema: AchievementSchema },
      { name: UserAchievement.name, schema: UserAchievementSchema },
      { name: Community.name, schema: CommunitySchema },
    ]),
    ProgressionModule,
  ],
  controllers: [AchievementController],
  providers: [AchievementService],
  exports: [AchievementService],
})
export class AchievementModule {}