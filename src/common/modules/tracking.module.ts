import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ContentTrackingService } from '../services/content-tracking.service';
import { 
  ContentProgress, 
  ContentProgressSchema, 
  TrackingAction, 
  TrackingActionSchema 
} from '../../schema/content-tracking.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'ContentProgress', schema: ContentProgressSchema },
      { name: 'TrackingAction', schema: TrackingActionSchema }
    ])
  ],
  providers: [ContentTrackingService],
  exports: [ContentTrackingService]
})
export class TrackingModule {}
