import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Content types for moderation
 */
export enum ContentType {
  POST = 'post',
  COURSE = 'course',
  EVENT = 'event',
  PRODUCT = 'product',
  COMMENT = 'comment',
  COMMUNITY = 'community',
  USER_PROFILE = 'user_profile',
}

/**
 * Moderation status for content items
 */
export enum ModerationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  FLAGGED = 'flagged',
  UNDER_REVIEW = 'under_review',
  ESCALATED = 'escalated',
}

/**
 * Priority levels for content moderation
 */
export enum ModerationPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
}

/**
 * Reasons for content rejection or flagging
 */
export enum ModerationReason {
  INAPPROPRIATE_CONTENT = 'inappropriate_content',
  SPAM = 'spam',
  HARASSMENT = 'harassment',
  COPYRIGHT_VIOLATION = 'copyright_violation',
  MISLEADING_INFORMATION = 'misleading_information',
  ADULT_CONTENT = 'adult_content',
  VIOLENCE = 'violence',
  HATE_SPEECH = 'hate_speech',
  PRIVACY_VIOLATION = 'privacy_violation',
  TERMS_VIOLATION = 'terms_violation',
  OTHER = 'other',
}

export type ContentModerationQueueDocument = ContentModerationQueue & Document;

/**
 * ContentModerationQueue schema for managing content review workflow
 * Tracks all content items that require administrative review and approval
 */
@Schema({ timestamps: true })
export class ContentModerationQueue {
  @Prop({ type: Types.ObjectId, required: true })
  contentId: Types.ObjectId;

  @Prop({ required: true, type: String, enum: ContentType })
  contentType: ContentType;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  creatorId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Community' })
  communityId?: Types.ObjectId;

  @Prop({ 
    required: true, 
    type: String, enum: ModerationStatus, 
    default: ModerationStatus.PENDING 
  })
  status: ModerationStatus;

  @Prop({ 
    type: String, enum: ModerationPriority, 
    default: ModerationPriority.NORMAL 
  })
  priority: ModerationPriority;

  @Prop({ type: Types.ObjectId, ref: 'AdminUser' })
  reviewedBy?: Types.ObjectId;

  @Prop()
  reviewedAt?: Date;

  @Prop()
  reviewNotes?: string;

  @Prop({ 
    type: [String], 
    enum: ModerationReason,
    default: []
  })
  rejectionReasons?: ModerationReason[];

  @Prop({ default: Date.now })
  submittedAt: Date;

  @Prop()
  escalatedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'AdminUser' })
  escalatedBy?: Types.ObjectId;

  @Prop()
  escalationReason?: string;

  @Prop({ type: Object })
  contentSnapshot?: Record<string, any>; // Snapshot of content at submission time

  @Prop({ type: Object })
  metadata?: Record<string, any>;

  @Prop({ default: 0 })
  reportCount: number; // Number of user reports for this content

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  reportedBy: Types.ObjectId[]; // Users who reported this content

  @Prop()
  autoModerationScore?: number; // AI/automated moderation confidence score

  @Prop({ type: Object })
  autoModerationFlags?: Record<string, any>; // Automated moderation flags

  @Prop({ default: false })
  requiresManualReview: boolean; // Flag for content that must be manually reviewed

  @Prop()
  reviewDeadline?: Date; // SLA deadline for review

  @Prop({ type: [String], default: [] })
  tags: string[]; // Tags for categorization and filtering
}

export const ContentModerationQueueSchema = SchemaFactory.createForClass(ContentModerationQueue);

// Indexes for efficient querying and performance
ContentModerationQueueSchema.index({ status: 1, submittedAt: -1 });
ContentModerationQueueSchema.index({ contentType: 1, status: 1 });
ContentModerationQueueSchema.index({ priority: 1, submittedAt: -1 });
ContentModerationQueueSchema.index({ reviewedBy: 1, reviewedAt: -1 });
ContentModerationQueueSchema.index({ creatorId: 1 });
ContentModerationQueueSchema.index({ communityId: 1 });
ContentModerationQueueSchema.index({ contentId: 1, contentType: 1 }, { unique: true });

// Compound indexes for common query patterns
ContentModerationQueueSchema.index({ 
  status: 1, 
  priority: 1, 
  submittedAt: -1 
});
ContentModerationQueueSchema.index({ 
  contentType: 1, 
  status: 1, 
  submittedAt: -1 
});
ContentModerationQueueSchema.index({ 
  reviewedBy: 1, 
  status: 1, 
  reviewedAt: -1 
});

// Virtual for populated creator data
ContentModerationQueueSchema.virtual('creator', {
  ref: 'User',
  localField: 'creatorId',
  foreignField: '_id',
  justOne: true
});

// Virtual for populated community data
ContentModerationQueueSchema.virtual('community', {
  ref: 'Community',
  localField: 'communityId',
  foreignField: '_id',
  justOne: true
});

// Virtual for populated reviewer data
ContentModerationQueueSchema.virtual('reviewer', {
  ref: 'AdminUser',
  localField: 'reviewedBy',
  foreignField: '_id',
  justOne: true
});

// Ensure virtual fields are serialized
ContentModerationQueueSchema.set('toJSON', { virtuals: true });
ContentModerationQueueSchema.set('toObject', { virtuals: true });