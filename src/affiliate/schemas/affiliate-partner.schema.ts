import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AffiliatePartnerDocument = AffiliatePartner & Document;

export type AffiliatePartnerStatus = 'pending' | 'approved' | 'rejected' | 'paused';

@Schema({ timestamps: true })
export class AffiliatePartner {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'AffiliateProgram', required: true })
  programId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  partnerUserId: Types.ObjectId;

  @Prop({ type: String, enum: ['pending', 'approved', 'rejected', 'paused'], default: 'pending' })
  status: AffiliatePartnerStatus;

  @Prop({ type: Date })
  approvedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  approvedBy?: Types.ObjectId;
}

export const AffiliatePartnerSchema = SchemaFactory.createForClass(AffiliatePartner);
AffiliatePartnerSchema.index({ programId: 1, partnerUserId: 1 }, { unique: true });
