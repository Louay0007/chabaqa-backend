import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { TrackableContentType } from '../../schema/content-tracking.schema';

export type AffiliateLinkDocument = AffiliateLink & Document;

@Schema({ timestamps: true })
export class AffiliateLink {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'AffiliateProgram', required: true })
  programId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  partnerUserId: Types.ObjectId;

  @Prop({ type: String, required: true })
  code: string;

  @Prop({ type: String, required: true })
  targetPath: string;

  @Prop({ type: String, enum: Object.values(TrackableContentType) })
  targetContentType?: TrackableContentType;

  @Prop({ type: String })
  targetContentId?: string;

  @Prop({ type: Types.ObjectId, ref: 'Community' })
  communityId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  creatorId?: Types.ObjectId;
}

export const AffiliateLinkSchema = SchemaFactory.createForClass(AffiliateLink);
AffiliateLinkSchema.index({ code: 1 }, { unique: true });
AffiliateLinkSchema.index({ programId: 1, partnerUserId: 1 });
