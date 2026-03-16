import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { TrackableContentType } from '../../schema/content-tracking.schema';

export type AffiliateConversionDocument = AffiliateConversion & Document;

export type AffiliateConversionStatus = 'pending' | 'approved' | 'paid' | 'reversed';

@Schema({ timestamps: true })
export class AffiliateConversion {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Order', required: true })
  orderId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'AffiliateProgram', required: true })
  programId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  partnerUserId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  buyerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  creatorId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Community' })
  communityId?: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(TrackableContentType) })
  contentType?: TrackableContentType;

  @Prop({ type: String })
  contentId?: string;

  @Prop({ type: Number, required: true })
  amountDT: number;

  @Prop({ type: Number, required: true })
  creatorNetDT: number;

  @Prop({ type: Number, required: true })
  commissionDT: number;

  @Prop({ type: String, enum: ['pending', 'approved', 'paid', 'reversed'], default: 'pending' })
  status: AffiliateConversionStatus;

  @Prop({ type: Date, required: true })
  holdUntil: Date;

  @Prop({ type: String })
  reason?: string;
}

export const AffiliateConversionSchema = SchemaFactory.createForClass(AffiliateConversion);
AffiliateConversionSchema.index({ orderId: 1 }, { unique: true });
AffiliateConversionSchema.index({ partnerUserId: 1, status: 1 });
AffiliateConversionSchema.index({ status: 1, holdUntil: 1 });
