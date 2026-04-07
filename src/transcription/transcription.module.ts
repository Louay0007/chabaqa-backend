import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TranscriptionService } from './transcription.service';
import { TranscriptionController } from './transcription.controller';
import { Transcript, TranscriptSchema } from '../schema/transcript.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Transcript.name, schema: TranscriptSchema }]),
  ],
  controllers: [TranscriptionController],
  providers: [TranscriptionService],
  exports: [TranscriptionService],
})
export class TranscriptionModule {}
