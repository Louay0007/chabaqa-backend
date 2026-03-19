import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AiChapterMessageRole = 'user' | 'assistant';

@Schema({ _id: false, timestamps: false })
export class AiChapterMessage {
  @Prop({
    required: true,
    type: String, enum: ['user', 'assistant'],
  })
  role: AiChapterMessageRole;

  @Prop({
    required: true,
    trim: true,
    maxlength: 8000,
  })
  content: string;

  @Prop({
    type: Date,
    default: Date.now,
  })
  createdAt: Date;

  @Prop({
    required: false,
    trim: true,
  })
  model?: string;
}

export const AiChapterMessageSchema =
  SchemaFactory.createForClass(AiChapterMessage);

export interface AiChapterConversationDocument extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  courseId: string;
  chapterId: string;
  messages: AiChapterMessage[];
  createdAt: Date;
  updatedAt: Date;
}

@Schema({
  timestamps: true,
  collection: 'ai_chapter_conversations',
})
export class AiChapterConversation {
  _id: Types.ObjectId;

  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'User',
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({
    required: true,
    trim: true,
    index: true,
  })
  courseId: string;

  @Prop({
    required: true,
    trim: true,
    index: true,
  })
  chapterId: string;

  @Prop({
    type: [AiChapterMessageSchema],
    default: [],
  })
  messages: AiChapterMessage[];

  createdAt: Date;
  updatedAt: Date;
}

export const AiChapterConversationSchema =
  SchemaFactory.createForClass(AiChapterConversation);

AiChapterConversationSchema.index(
  { userId: 1, courseId: 1, chapterId: 1 },
  { unique: true },
);
AiChapterConversationSchema.index({ updatedAt: -1 });
