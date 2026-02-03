import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { ConfigModule } from '@nestjs/config';
import { CoursModule } from '../cours/cours.module';

@Module({
  imports: [ConfigModule, CoursModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
