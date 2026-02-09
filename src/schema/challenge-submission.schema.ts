import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ChallengeSubmissionDocument = ChallengeSubmission & Document;

@Schema({ timestamps: true })
export class ChallengeSubmission {
  @Prop({ type: Types.ObjectId, ref: 'Challenge', required: true })
  challengeId: Types.ObjectId;

  @Prop({ required: true })
  taskId: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  content: string; // Text description or comment

  @Prop({ type: [String], default: [] })
  links: string[]; // Links to project (GitHub, Figma, etc.)

  @Prop({ type: [String], default: [] })
  files: string[]; // Uploaded file URLs

  @Prop({
    type: String,
    enum: ['pending', 'approved', 'rejected', 'feedback_required'],
    default: 'pending'
  })
  status: 'pending' | 'approved' | 'rejected' | 'feedback_required';

  @Prop({ trim: true })
  feedback?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  reviewedBy?: Types.ObjectId;

  @Prop()
  reviewedAt?: Date;

  @Prop({ type: Number, default: 0 })
  pointsAwarded: number;
}

export const ChallengeSubmissionSchema = SchemaFactory.createForClass(ChallengeSubmission);

ChallengeSubmissionSchema.index({ challengeId: 1, userId: 1, taskId: 1 }, { unique: true });
ChallengeSubmissionSchema.index({ status: 1 });
ChallengeSubmissionSchema.index({ userId: 1 });
