import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Enum for email campaign status
 */
export enum EmailCampaignStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  SENDING = 'sending',
  SENT = 'sent',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

/**
 * Enum for email campaign type
 */
export enum EmailCampaignType {
  ANNOUNCEMENT = 'announcement',
  NEWSLETTER = 'newsletter',
  PROMOTION = 'promotion',
  EVENT_REMINDER = 'event_reminder',
  COURSE_UPDATE = 'course_update',
  INACTIVE_USER_REACTIVATION = 'inactive_user_reactivation',
  CUSTOM = 'custom'
}

/**
 * Enum for inactivity periods
 */
export enum InactivityPeriod {
  LAST_7_DAYS = 'last_7_days',
  LAST_15_DAYS = 'last_15_days',
  LAST_30_DAYS = 'last_30_days',
  LAST_60_DAYS = 'last_60_days',
  MORE_THAN_60_DAYS = 'more_than_60_days'
}

/**
 * Schema for email recipients
 */
@Schema({ _id: false })
export class EmailRecipient {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  name: string;

  @Prop({ 
    enum: ['pending', 'sent', 'failed', 'bounced'],
    default: 'pending'
  })
  status: 'pending' | 'sent' | 'failed' | 'bounced';

  @Prop()
  sentAt?: Date;

  @Prop()
  errorMessage?: string;

  @Prop({ default: false })
  opened: boolean;

  @Prop()
  openedAt?: Date;

  @Prop({ default: 0 })
  clickCount: number;

  @Prop({ type: [Date] })
  clickedAt?: Date[];

  @Prop({ required: false })
  personalizedContent?: string;

  @Prop({ required: false })
  personalizedSubject?: string;
}

export const EmailRecipientSchema = SchemaFactory.createForClass(EmailRecipient);

/**
 * Main email campaign schema
 */
@Schema({ timestamps: true })
export class EmailCampaign {
  _id: Types.ObjectId;

  /**
   * Campaign title
   */
  @Prop({ 
    required: true,
    trim: true,
    maxlength: 200
  })
  title: string;

  /**
   * Email subject line
   */
  @Prop({ 
    required: true,
    trim: true,
    maxlength: 200
  })
  subject: string;

  /**
   * Email content (HTML or plain text)
   */
  @Prop({ 
    required: true
  })
  content: string;

  /**
   * Reference to the community
   */
  @Prop({ 
    required: true, 
    type: Types.ObjectId, 
    ref: 'Community',
    index: true
  })
  communityId: Types.ObjectId;

  /**
   * Reference to the creator
   */
  @Prop({ 
    required: true, 
    type: Types.ObjectId, 
    ref: 'User',
    index: true
  })
  creatorId: Types.ObjectId;

  /**
   * Campaign type
   */
  @Prop({ 
    enum: EmailCampaignType,
    default: EmailCampaignType.CUSTOM
  })
  type: EmailCampaignType;

  /**
   * Campaign status
   */
  @Prop({ 
    enum: EmailCampaignStatus,
    default: EmailCampaignStatus.DRAFT,
    index: true
  })
  status: EmailCampaignStatus;

  /**
   * List of recipients
   */
  @Prop({ 
    type: [EmailRecipientSchema], 
    default: [] 
  })
  recipients: EmailRecipient[];

  /**
   * Total number of recipients
   */
  @Prop({ 
    default: 0,
    min: 0
  })
  totalRecipients: number;

  /**
   * Number of emails sent successfully
   */
  @Prop({ 
    default: 0,
    min: 0
  })
  sentCount: number;

  /**
   * Number of emails that failed
   */
  @Prop({ 
    default: 0,
    min: 0
  })
  failedCount: number;

  /**
   * Scheduled send date
   */
  @Prop()
  scheduledAt?: Date;

  /**
   * Actual send date
   */
  @Prop()
  sentAt?: Date;

  /**
   * Whether content is HTML
   */
  @Prop({ 
    default: false
  })
  isHtml: boolean;

  /**
   * Template ID used (if any)
   */
  @Prop()
  templateId?: string;

  /**
   * Template data for variable replacement
   */
  @Prop({ 
    type: Object,
    default: {}
  })
  templateData?: Record<string, any>;

  /**
   * Whether to track email opens
   */
  @Prop({ 
    default: true
  })
  trackOpens: boolean;

  /**
   * Whether to track email clicks
   */
  @Prop({ 
    default: true
  })
  trackClicks: boolean;

  /**
   * Total number of opens
   */
  @Prop({ 
    default: 0,
    min: 0
  })
  openCount: number;

  /**
   * Total number of clicks
   */
  @Prop({ 
    default: 0,
    min: 0
  })
  clickCount: number;

  /**
   * Whether this is an inactive user campaign
   */
  @Prop({ 
    default: false,
    index: true
  })
  isInactiveUserCampaign: boolean;

  /**
   * Target inactivity period (for inactive user campaigns)
   */
  @Prop({ 
    enum: InactivityPeriod
  })
  targetInactivityPeriod?: InactivityPeriod;

  /**
   * Days threshold for targeting
   */
  @Prop({ 
    min: 0
  })
  targetDaysThreshold?: number;

  /**
   * Whether to target all inactive users
   */
  @Prop({ 
    default: false
  })
  targetAllInactive?: boolean;

  /**
   * Campaign metadata
   */
  @Prop({ 
    type: Object,
    default: {}
  })
  metadata?: Record<string, any>;

  /**
   * Timestamps
   */
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Interface for the document
 */
export interface EmailCampaignDocument extends Document {
  _id: Types.ObjectId;
  title: string;
  subject: string;
  content: string;
  communityId: Types.ObjectId;
  creatorId: Types.ObjectId;
  type: EmailCampaignType;
  status: EmailCampaignStatus;
  recipients: EmailRecipient[];
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  scheduledAt?: Date;
  sentAt?: Date;
  isHtml: boolean;
  templateId?: string;
  templateData?: Record<string, any>;
  trackOpens: boolean;
  trackClicks: boolean;
  openCount: number;
  clickCount: number;
  isInactiveUserCampaign: boolean;
  targetInactivityPeriod?: InactivityPeriod;
  targetDaysThreshold?: number;
  targetAllInactive?: boolean;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create the schema
 */
export const EmailCampaignSchema = SchemaFactory.createForClass(EmailCampaign);

// Indexes for efficient queries
EmailCampaignSchema.index({ communityId: 1, status: 1 });
EmailCampaignSchema.index({ creatorId: 1, status: 1 });
EmailCampaignSchema.index({ isInactiveUserCampaign: 1, status: 1 });
EmailCampaignSchema.index({ targetInactivityPeriod: 1 });
EmailCampaignSchema.index({ scheduledAt: 1 });
EmailCampaignSchema.index({ createdAt: -1 });
EmailCampaignSchema.index({ sentAt: -1 });

// Pre-save middleware to update counts
EmailCampaignSchema.pre('save', function(next) {
  if (this.isModified('recipients')) {
    this.totalRecipients = this.recipients.length;
    this.sentCount = this.recipients.filter(r => r.status === 'sent').length;
    this.failedCount = this.recipients.filter(r => r.status === 'failed').length;
    this.openCount = this.recipients.filter(r => r.opened).length;
    this.clickCount = this.recipients.reduce((sum, r) => sum + r.clickCount, 0);
  }
  next();
});
