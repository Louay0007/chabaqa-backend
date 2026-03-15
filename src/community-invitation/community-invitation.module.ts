import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { CommunityInvitationController } from './community-invitation.controller';
import { CommunityInvitationService } from './community-invitation.service';
import {
  CommunityInvitation,
  CommunityInvitationSchema,
} from '../schema/community-invitation.schema';
import { Community, CommunitySchema } from '../schema/community.schema';
import { User, UserSchema } from '../schema/user.schema';
import { EmailService } from '../common/services/email.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CommunityInvitation.name, schema: CommunityInvitationSchema },
      { name: Community.name, schema: CommunitySchema },
      { name: User.name, schema: UserSchema },
    ]),
    ScheduleModule.forRoot(),
    AuthModule,
  ],
  controllers: [CommunityInvitationController],
  providers: [CommunityInvitationService, EmailService],
  exports: [CommunityInvitationService],
})
export class CommunityInvitationModule {}
