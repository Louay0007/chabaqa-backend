import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { GeoService } from './geo.service';
import { GeoController } from './geo.controller';
import { GeoGamificationService } from './geo-gamification.service';
import { ConfigModule } from '@nestjs/config';
import { CoursModule } from '../cours/cours.module';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AiChapterConversation,
  AiChapterConversationSchema,
} from '../schema/ai-chapter-conversation.schema';
import {
  GeoUserProfile,
  GeoUserProfileSchema,
} from '../schema/geo-user-profile.schema';
import { GeoQuiz, GeoQuizSchema } from '../schema/geo-quiz.schema';

@Module({
  imports: [
    ConfigModule,
    CoursModule,
    MongooseModule.forFeature([
      { name: AiChapterConversation.name, schema: AiChapterConversationSchema },
      { name: GeoUserProfile.name, schema: GeoUserProfileSchema },
      { name: GeoQuiz.name, schema: GeoQuizSchema },
    ]),
  ],
  controllers: [AiController, GeoController],
  providers: [AiService, GeoService, GeoGamificationService],
  exports: [AiService, GeoService, GeoGamificationService],
})
export class AiModule {}
