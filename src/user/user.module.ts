import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { UserController } from './user.controller';
import { UserService } from './user.service';

import { User, UserSchema } from '../schema/user.schema';
import {
  VerificationCode,
  VerificationCodeSchema,
} from '../schema/verification-code.schema';
import {
  UserSession,
  UserSessionSchema,
} from '../schema/user-session.schema';

import { EmailService } from '../common/services/email.service';
import { UploadModule } from '../upload/upload.module';
import { CommunityAffCreaJoinModule } from '../community-aff-crea-join/community-aff-crea-join.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: VerificationCode.name, schema: VerificationCodeSchema },
      { name: UserSession.name, schema: UserSessionSchema },
    ]),
    UploadModule,
    CommunityAffCreaJoinModule,
    // AuthModule exports TokenBlacklistService, consumed optionally by UserService
    AuthModule,
  ],
  controllers: [UserController],
  providers: [UserService, EmailService],
  exports: [UserService],
})
export class UserModule {}
