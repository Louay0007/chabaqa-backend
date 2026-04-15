import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum WebhookEvent {
  // Community
  COMMUNITY_MEMBER_JOINED = 'community.member.joined',
  COMMUNITY_MEMBER_LEFT = 'community.member.left',

  // Posts
  POST_CREATED = 'post.created',
  POST_UPDATED = 'post.updated',
  POST_DELETED = 'post.deleted',

  // Comments
  COMMENT_CREATED = 'comment.created',

  // Subscriptions
  SUBSCRIPTION_CREATED = 'subscription.created',
  SUBSCRIPTION_CANCELLED = 'subscription.cancelled',
  SUBSCRIPTION_RENEWED = 'subscription.renewed',

  // Payments
  PAYMENT_SUCCEEDED = 'payment.succeeded',
  PAYMENT_FAILED = 'payment.failed',

  // Courses
  COURSE_ENROLLED = 'course.enrolled',
  COURSE_COMPLETED = 'course.completed',

  // Challenges
  CHALLENGE_STARTED = 'challenge.started',
  CHALLENGE_COMPLETED = 'challenge.completed',
}

@Schema({ timestamps: true, collection: 'webhook_configs' })
export class WebhookConfig {
  _id: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  creatorId: Types.ObjectId;

  @Prop({ required: true, type: String })
  communityId: string;

  @Prop({ required: true, type: String, trim: true, maxlength: 100 })
  name: string;

  @Prop({ required: true, type: String })
  url: string;

  @Prop({ required: true, type: [String], enum: WebhookEvent })
  events: WebhookEvent[];

  /** HMAC-SHA256 signing secret — shown only once at creation */
  @Prop({ required: true, type: String })
  secret: string;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: Number, default: 0 })
  failuresCount: number;

  @Prop({ type: Date })
  lastTriggeredAt?: Date;

  @Prop({ type: String })
  lastFailureReason?: string;

  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookConfigDocument extends Document {
  _id: Types.ObjectId;
  creatorId: Types.ObjectId;
  communityId: string;
  name: string;
  url: string;
  events: WebhookEvent[];
  secret: string;
  isActive: boolean;
  failuresCount: number;
  lastTriggeredAt?: Date;
  lastFailureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const WebhookConfigSchema = SchemaFactory.createForClass(WebhookConfig);

WebhookConfigSchema.index({ communityId: 1, isActive: 1 });
WebhookConfigSchema.index({ creatorId: 1, communityId: 1 });
WebhookConfigSchema.index({ communityId: 1, events: 1 });
