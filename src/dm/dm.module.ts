import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { MongooseModule } from '@nestjs/mongoose';
import { DmService } from './dm.service';
import { DmController } from './dm.controller';
import { DmGateway } from './dm.gateway';
import { Conversation, ConversationSchema } from '../schema/conversation.schema';
import { Message, MessageSchema } from '../schema/message.schema';
import { AuthModule } from '../auth/auth.module';
import { UploadModule } from '../upload/upload.module';
import { PolicyModule } from '../common/modules/policy.module';
import { Community, CommunitySchema } from '../schema/community.schema';
import { User, UserSchema } from '../schema/user.schema';
import { Admin, AdminSchema } from '../schema/admin.schema';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60, limit: 60 }]),
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: Community.name, schema: CommunitySchema },
      { name: User.name, schema: UserSchema },
      { name: Admin.name, schema: AdminSchema },
    ]),
    AuthModule,
    UploadModule,
    PolicyModule,
  ],
  controllers: [DmController],
  providers: [DmService, DmGateway],
  exports: [DmService],
})
export class DmModule {}


