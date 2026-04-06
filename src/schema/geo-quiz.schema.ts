import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type GeoQuizDocument = GeoQuiz & Document;

export type GeoDifficultyLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';
export type GeoQuestionType = 'multiple-choice' | 'true-false' | 'fill-blank';

@Schema({ _id: false, timestamps: false })
export class GeoQuizQuestion {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  question: string;

  @Prop({
    required: true,
    type: String,
    enum: ['multiple-choice', 'true-false', 'fill-blank'],
  })
  type: GeoQuestionType;

  @Prop({ type: [String] })
  options?: string[];

  @Prop({ required: true })
  correctAnswer: string;

  @Prop({ required: true })
  explanation: string;

  @Prop({ type: String })
  userAnswer?: string;

  @Prop({ type: Boolean })
  isCorrect?: boolean;
}

export const GeoQuizQuestionSchema = SchemaFactory.createForClass(GeoQuizQuestion);

@Schema({ timestamps: true, collection: 'geo_quizzes' })
export class GeoQuiz {
  _id: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ required: true })
  courseId: string;

  @Prop({ required: true })
  chapterId: string;

  @Prop({
    type: String,
    enum: ['beginner', 'intermediate', 'advanced', 'expert'],
    required: true,
  })
  difficultyLevel: GeoDifficultyLevel;

  @Prop({ type: [GeoQuizQuestionSchema], default: [] })
  questions: GeoQuizQuestion[];

  @Prop({ type: Number })
  score?: number;

  @Prop({ type: Number })
  totalQuestions?: number;

  @Prop({ type: Number })
  percentage?: number;

  @Prop({ type: Number })
  pointsEarned?: number;

  @Prop({ type: Date })
  completedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const GeoQuizSchema = SchemaFactory.createForClass(GeoQuiz);
GeoQuizSchema.index({ userId: 1, courseId: 1, chapterId: 1 });
GeoQuizSchema.index({ userId: 1, completedAt: -1 });
GeoQuizSchema.index({ completedAt: -1 });
