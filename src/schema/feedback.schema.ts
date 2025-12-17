
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class Feedback extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, refPath: 'relatedModel' })
  relatedTo: MongooseSchema.Types.ObjectId;

  @Prop({ type: String, required: true, enum: ['Community', 'Cours', 'Challenge', 'Event', 'Product', 'Session'] })
  relatedModel: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  user: MongooseSchema.Types.ObjectId;

  @Prop({ type: Number, required: true, min: 1, max: 5 })
  rating: number;

  @Prop({ type: String })
  comment?: string;
}

export const FeedbackSchema = SchemaFactory.createForClass(Feedback);

FeedbackSchema.index({ relatedTo: 1, relatedModel: 1 });
FeedbackSchema.index({ user: 1, relatedTo: 1, relatedModel: 1 }, { unique: true });
