import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  UserLoginActivity,
  UserLoginActivitySchema,
} from '../schema/user-login-activity.schema';
import { User, UserSchema } from '../schema/user.schema';
import { Community, CommunitySchema } from '../schema/community.schema';
import { UserLoginActivityService } from './user-login-activity.service';
import { GamificationModule } from '../gamification/gamification.module';

/**
 * Module for managing user login activity tracking
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserLoginActivity.name, schema: UserLoginActivitySchema },
      { name: User.name, schema: UserSchema },
      { name: Community.name, schema: CommunitySchema },
    ]),
    GamificationModule,
  ],
  providers: [UserLoginActivityService],
  exports: [UserLoginActivityService],
})
export class UserLoginActivityModule {}
