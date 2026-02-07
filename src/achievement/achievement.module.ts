import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Achievement, AchievementSchema } from '../schema/achievement.schema';
import { UserAchievement, UserAchievementSchema } from '../schema/user-achievement.schema';
import { Community, CommunitySchema } from '../schema/community.schema';
import { Post, PostSchema } from '../schema/post.schema';
import { UserLoginActivity, UserLoginActivitySchema } from '../schema/user-login-activity.schema';
import { User, UserSchema } from '../schema/user.schema';
import { AchievementService } from './achievement.service';
import { AchievementController } from './achievement.controller';
import { ProgressionModule } from '../progression/progression.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Achievement.name, schema: AchievementSchema },
      { name: UserAchievement.name, schema: UserAchievementSchema },
      { name: Community.name, schema: CommunitySchema },
      { name: Post.name, schema: PostSchema },
      { name: UserLoginActivity.name, schema: UserLoginActivitySchema },
      { name: User.name, schema: UserSchema },
    ]),
    ProgressionModule,
  ],
  controllers: [AchievementController],
  providers: [AchievementService],
  exports: [AchievementService],
})
export class AchievementModule {}