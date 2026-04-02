import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { MongooseModule } from '@nestjs/mongoose';
import { ChannelService } from './channel.service';
import { ChannelController } from './channel.controller';
import { ChannelGateway } from './channel.gateway';
import { Channel, ChannelSchema } from '../schema/channel.schema';
import { ChannelMessage, ChannelMessageSchema } from '../schema/channel-message.schema';
import { ChannelMember, ChannelMemberSchema } from '../schema/channel-member.schema';
import { ChannelReadCursor, ChannelReadCursorSchema } from '../schema/channel-read-cursor.schema';
import { Community, CommunitySchema } from '../schema/community.schema';
import { User, UserSchema } from '../schema/user.schema';
import { AuthModule } from '../auth/auth.module';
import { UploadModule } from '../upload/upload.module';
import { PolicyModule } from '../common/modules/policy.module';
import { NotificationModule } from '../notification/notification.module';
import { CommunityAccessModule } from '../community-access/community-access.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60, limit: 60 }]),
    MongooseModule.forFeature([
      { name: Channel.name, schema: ChannelSchema },
      { name: ChannelMessage.name, schema: ChannelMessageSchema },
      { name: ChannelMember.name, schema: ChannelMemberSchema },
      { name: ChannelReadCursor.name, schema: ChannelReadCursorSchema },
      { name: Community.name, schema: CommunitySchema },
      { name: User.name, schema: UserSchema },
    ]),
    AuthModule,
    UploadModule,
    PolicyModule,
    NotificationModule,
    CommunityAccessModule,
  ],
  controllers: [ChannelController],
  providers: [ChannelService, ChannelGateway],
  exports: [ChannelService, ChannelGateway],
})
export class ChannelModule {}
