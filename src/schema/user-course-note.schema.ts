
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserCourseNoteDocument = UserCourseNote & Document;

@Schema({ timestamps: true })
export class UserCourseNote {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Cours', required: true })
  courseId: Types.ObjectId;

  @Prop({ type: String, required: true })
  chapterId: string;

  @Prop({ type: String, required: true })
  content: string;

  @Prop({ type: Number })
  timestamp?: number; // Video timestamp in seconds

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;
}

export const UserCourseNoteSchema = SchemaFactory.createForClass(UserCourseNote);

// Index for fast retrieval of notes by user and course/chapter
UserCourseNoteSchema.index({ userId: 1, courseId: 1, chapterId: 1 });
