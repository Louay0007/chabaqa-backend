import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum GamificationEventType {
  POST_CREATED = 'post_created',
  COMMENT_CREATED = 'comment_created',
  POST_LIKE_RECEIVED = 'post_like_received',
  COMMENT_LIKE_RECEIVED = 'comment_like_received',
  COURSE_COMPLETED = 'course_completed',
  CHALLENGE_TASK_APPROVED = 'challenge_task_approved',
  CHALLENGE_COMPLETED = 'challenge_completed',
  DAILY_LOGIN = 'daily_login',
  STREAK_BONUS = 'streak_bonus',
  ADMIN_ADJUSTMENT = 'admin_adjustment',
}

export type GamificationEventDocument = GamificationEvent & Document;

@Schema({ timestamps: true, collection: 'gamification_events' })
export class GamificationEvent {
  @Prop({ type: String, required: true, enum: GamificationEventType })
  eventType: GamificationEventType;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  actorUserId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  recipientUserId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Community', required: true })
  communityId: Types.ObjectId;

  @Prop({ type: String })
  sourceType: string;

  @Prop({ type: String })
  sourceId: string;

  @Prop({ type: Number, required: true })
  pointsDelta: number;

  @Prop({ type: String, required: true, unique: true })
  idempotencyKey: string;

  @Prop({ type: Object })
  metadata: Record<string, any>;
}

export const GamificationEventSchema =
  SchemaFactory.createForClass(GamificationEvent);

// idempotencyKey unique index is already declared via @Prop({ unique: true }) above
GamificationEventSchema.index({ communityId: 1, createdAt: -1 });
GamificationEventSchema.index({ recipientUserId: 1, createdAt: -1 });
GamificationEventSchema.index({
  actorUserId: 1,
  communityId: 1,
  createdAt: -1,
});
