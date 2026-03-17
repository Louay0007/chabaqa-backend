import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { CommunityStaffRole } from '../common/permissions';

export type CommunityStaffDocument = CommunityStaff & Document;

@Schema({
  collection: 'community_staff',
  timestamps: true,
})
export class CommunityStaff {
  @Prop({ type: Types.ObjectId, ref: 'Community', required: true, index: true })
  communityId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(CommunityStaffRole),
    required: true,
  })
  role: CommunityStaffRole;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;

  @Prop({
    type: String,
    enum: ['active', 'disabled'],
    default: 'active',
  })
  status: string;
}

export const CommunityStaffSchema = SchemaFactory.createForClass(CommunityStaff);

// Unique index: one staff record per user per community
CommunityStaffSchema.index({ communityId: 1, userId: 1 }, { unique: true });

// Lookup by community + role (e.g. list all admins)
CommunityStaffSchema.index({ communityId: 1, role: 1 });
