import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Schema for tracking user login activity per community
 * This helps identify inactive users for email campaigns
 */
@Schema({ timestamps: true })
export class UserLoginActivity {
  _id: Types.ObjectId;

  /**
   * Reference to the user
   */
  @Prop({ 
    required: true, 
    type: Types.ObjectId, 
    ref: 'User',
    index: true
  })
  userId: Types.ObjectId;

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
   * Last login timestamp
   */
  @Prop({ 
    required: true,
    default: Date.now,
    index: true
  })
  lastLoginAt: Date;

  /**
   * Days since last login (calculated daily)
   */
  @Prop({ 
    default: 0,
    min: 0
  })
  daysSinceLastLogin: number;

  /**
   * Inactivity status based on days since last login
   */
  @Prop({ 
    enum: ['active', 'inactive_7d', 'inactive_15d', 'inactive_30d', 'inactive_60d_plus'],
    default: 'active',
    index: true
  })
  inactivityStatus: 'active' | 'inactive_7d' | 'inactive_15d' | 'inactive_30d' | 'inactive_60d_plus';

  /**
   * Whether this user is a target for reactivation campaigns
   */
  @Prop({ 
    default: false,
    index: true
  })
  isReactivationTarget: boolean;

  /**
   * Last reactivation email sent date
   */
  @Prop()
  lastReactivationEmailSent?: Date;

  /**
   * Number of reactivation emails sent to this user
   */
  @Prop({ 
    default: 0,
    min: 0
  })
  reactivationEmailCount: number;

  /**
   * When user joined this community
   */
  @Prop({ 
    default: Date.now
  })
  joinedAt: Date;

  /**
   * Timestamps
   */
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Interface for the document
 */
export interface UserLoginActivityDocument extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  communityId: Types.ObjectId;
  lastLoginAt: Date;
  daysSinceLastLogin: number;
  inactivityStatus: 'active' | 'inactive_7d' | 'inactive_15d' | 'inactive_30d' | 'inactive_60d_plus';
  isReactivationTarget: boolean;
  lastReactivationEmailSent?: Date;
  reactivationEmailCount: number;
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create the schema
 */
export const UserLoginActivitySchema = SchemaFactory.createForClass(UserLoginActivity);

// Compound indexes for efficient queries
UserLoginActivitySchema.index({ userId: 1, communityId: 1 }, { unique: true });
UserLoginActivitySchema.index({ communityId: 1, inactivityStatus: 1 });
UserLoginActivitySchema.index({ communityId: 1, isReactivationTarget: 1 });
UserLoginActivitySchema.index({ lastLoginAt: -1 });
UserLoginActivitySchema.index({ daysSinceLastLogin: -1 });

// Pre-save middleware to update inactivity status
UserLoginActivitySchema.pre('save', function(next) {
  const now = new Date();
  const daysSinceLogin = Math.floor(
    (now.getTime() - this.lastLoginAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  this.daysSinceLastLogin = daysSinceLogin;

  // Update inactivity status based on days since login
  if (daysSinceLogin <= 7) {
    this.inactivityStatus = 'active';
    this.isReactivationTarget = false;
  } else if (daysSinceLogin <= 15) {
    this.inactivityStatus = 'inactive_7d';
    this.isReactivationTarget = true;
  } else if (daysSinceLogin <= 30) {
    this.inactivityStatus = 'inactive_15d';
    this.isReactivationTarget = true;
  } else if (daysSinceLogin <= 60) {
    this.inactivityStatus = 'inactive_30d';
    this.isReactivationTarget = true;
  } else {
    this.inactivityStatus = 'inactive_60d_plus';
    this.isReactivationTarget = true;
  }

  next();
});
