import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PlaybackSession,
  PlaybackSessionSchema,
} from '../schema/playback-session.schema';
import { ChapterAccessModule } from '../common/modules/chapter-access.module';
import { VideoPlaybackService } from './video-playback.service';
import { VideoController } from './video.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PlaybackSession.name, schema: PlaybackSessionSchema },
    ]),
    ChapterAccessModule,
  ],
  controllers: [VideoController],
  providers: [VideoPlaybackService],
  exports: [VideoPlaybackService],
})
export class VideoModule {}
