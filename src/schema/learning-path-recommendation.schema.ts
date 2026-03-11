import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LearningPathRecommendationDocument = LearningPathRecommendation & Document;

@Schema({ _id: false })
export class LearningPathRecommendationItem {
  @Prop({ required: true, trim: true })
  id: string;

  @Prop({ required: true, trim: true })
  type: string;

  @Prop({ required: true, trim: true })
  contentId: string;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, trim: true, maxlength: 600 })
  reason: string;

  @Prop({ type: Number, default: 0 })
  score: number;

  @Prop({ type: Object, default: {} })
  metadata?: Record<string, any>;
}

export const LearningPathRecommendationItemSchema = SchemaFactory.createForClass(
  LearningPathRecommendationItem,
);

@Schema({
  timestamps: true,
  collection: 'learning_path_recommendations',
})
export class LearningPathRecommendation {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, trim: true, index: true })
  goalsHash: string;

  @Prop({ required: false, trim: true, index: true })
  communityId?: string;

  @Prop({ type: [LearningPathRecommendationItemSchema], default: [] })
  items: LearningPathRecommendationItem[];

  @Prop({ type: Date, default: Date.now, expires: 21600 })
  generatedAt: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const LearningPathRecommendationSchema = SchemaFactory.createForClass(
  LearningPathRecommendation,
);
