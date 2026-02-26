import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { ConfigModule } from '@nestjs/config';
import { CoursModule } from '../cours/cours.module';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AiChapterConversation,
  AiChapterConversationSchema,
} from '../schema/ai-chapter-conversation.schema';

@Module({
  imports: [
    ConfigModule,
    CoursModule,
    MongooseModule.forFeature([
      { name: AiChapterConversation.name, schema: AiChapterConversationSchema },
    ]),
  ],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
