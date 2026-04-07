import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TranscriptDocument = HydratedDocument<Transcript>;

@Schema()
export class TranscriptSegment {
  @Prop({ required: true })
  start: number;

  @Prop({ required: true })
  end: number;

  @Prop({ required: true })
  text: string;
}

@Schema({ timestamps: true })
export class Transcript {
  @Prop({ required: true, index: true })
  chapterId: string;

  @Prop({ required: true, index: true })
  courseId: string;

  @Prop({ required: true })
  videoStorageKey: string;

  @Prop({ required: true, enum: ['ar', 'fr', 'en', 'auto'], default: 'auto' })
  language: string;

  @Prop({
    required: true,
    enum: ['pending', 'processing', 'done', 'failed'],
    default: 'pending',
  })
  status: string;

  @Prop({ type: [TranscriptSegment], default: [] })
  segments: TranscriptSegment[];

  @Prop({ default: '' })
  fullText: string;

  @Prop({ default: '' })
  srtContent: string;

  @Prop({ default: '' })
  vttContent: string;

  @Prop()
  errorMessage?: string;
}

export const TranscriptSchema = SchemaFactory.createForClass(Transcript);

TranscriptSchema.index({ fullText: 'text' });
