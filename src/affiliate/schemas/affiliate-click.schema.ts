import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AffiliateClickDocument = AffiliateClick & Document;

@Schema({ timestamps: true })
export class AffiliateClick {
  _id: Types.ObjectId;

  @Prop({ type: String, required: true })
  clickId: string;

  @Prop({ type: Types.ObjectId, ref: 'AffiliateProgram', required: true })
  programId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  partnerUserId: Types.ObjectId;

  @Prop({ type: String, required: true })
  linkCode: string;

  @Prop({ type: String })
  landingPath?: string;

  @Prop({ type: String })
  referrer?: string;

  @Prop({ type: String })
  utmSource?: string;

  @Prop({ type: String })
  utmMedium?: string;

  @Prop({ type: String })
  utmCampaign?: string;

  @Prop({ type: String })
  ipHash?: string;

  @Prop({ type: String })
  userAgentHash?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  viewerUserId?: Types.ObjectId;
}

export const AffiliateClickSchema = SchemaFactory.createForClass(AffiliateClick);
AffiliateClickSchema.index({ clickId: 1 }, { unique: true });
AffiliateClickSchema.index({ programId: 1, partnerUserId: 1, createdAt: -1 });
