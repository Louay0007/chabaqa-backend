import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { LiveRoom, LiveRoomSchema, LiveParticipant, LiveParticipantSchema } from '../schema/live-room.schema';
import { LiveStreamingController } from './live-streaming.controller';
import { LiveStreamingService } from './live-streaming.service';
import { LiveKitService } from './livekit.service';
import { CommunityAccessModule } from '../community-access/community-access.module';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: LiveRoom.name, schema: LiveRoomSchema },
      { name: LiveParticipant.name, schema: LiveParticipantSchema },
    ]),
    CommunityAccessModule,
  ],
  controllers: [LiveStreamingController],
  providers: [LiveStreamingService, LiveKitService],
  exports: [LiveStreamingService, LiveKitService],
})
export class LiveStreamingModule {}
