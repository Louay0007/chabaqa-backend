import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CommunityInvitationDocument = CommunityInvitation & Document;

export enum InvitationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
}

@Schema({ timestamps: true })
export class CommunityInvitation {
  @Prop({ required: true, lowercase: true, trim: true, index: true })
  email: string;

  @Prop({ trim: true, default: '' })
  name: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Community', index: true })
  communityId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  creatorId: Types.ObjectId;

  @Prop({ required: true, unique: true, sparse: true })
  token: string;

  @Prop({
    required: true,
    type: String, enum: InvitationStatus,
    default: InvitationStatus.PENDING,
    index: true,
  })
  status: InvitationStatus;

  @Prop({ maxlength: 500, default: '' })
  personalMessage: string;

  @Prop({ default: () => new Date() })
  invitedAt: Date;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop()
  acceptedAt: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  acceptedByUserId: Types.ObjectId;

  @Prop({ default: 0 })
  resendCount: number;

  @Prop()
  lastResentAt: Date;
}

export const CommunityInvitationSchema = SchemaFactory.createForClass(CommunityInvitation);

// Compound index to prevent duplicate pending invitations for same email+community
CommunityInvitationSchema.index({ communityId: 1, email: 1 });

// Index for token lookups (accept flow)
CommunityInvitationSchema.index({ token: 1 }, { unique: true, sparse: true });

// Index for expiry cron job
CommunityInvitationSchema.index({ status: 1, expiresAt: 1 });
