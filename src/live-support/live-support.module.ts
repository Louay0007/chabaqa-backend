import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { Conversation, ConversationSchema } from '../schema/conversation.schema';
import { SupportMessage, SupportMessageSchema } from '../schema/support-message.schema';
import { Admin, AdminSchema } from '../schema/admin.schema';
import { User, UserSchema } from '../schema/user.schema';
import { LiveSupportController } from './live-support.controller';
import { LiveSupportService } from './live-support.service';
import { LiveSupportGateway } from './live-support.gateway';
import { LiveSupportAiService } from './live-support-ai.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: SupportMessage.name, schema: SupportMessageSchema },
      { name: Admin.name, schema: AdminSchema },
      { name: User.name, schema: UserSchema },
    ]),
    AuthModule,
  ],
  controllers: [LiveSupportController],
  providers: [LiveSupportService, LiveSupportGateway, LiveSupportAiService],
  exports: [LiveSupportService, LiveSupportGateway],
})
export class LiveSupportModule {}
