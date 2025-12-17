import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { TrackableContentType } from './content-tracking.schema';

export type PromoCodeDocument = PromoCode & Document;

@Schema({ timestamps: true })
export class PromoCode {
  _id: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true, uppercase: true, unique: true })
  code: string;

  @Prop({ type: Number, min: 0, max: 100 })
  percentOff?: number;

  @Prop({ type: Number, min: 0 })
  amountOffDT?: number;

  @Prop({ type: String, enum: Object.values(TrackableContentType), default: null })
  appliesToType?: TrackableContentType | null;

  @Prop({ type: String, default: null })
  appliesToId?: string | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  creatorId?: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  communityId?: string | null;

  @Prop({ type: Date, default: null })
  startsAt?: Date | null;

  @Prop({ type: Date, default: null })
  endsAt?: Date | null;

  @Prop({ type: Number, default: null, min: 1 })
  maxRedemptions?: number | null;

  @Prop({ type: Number, default: 0, min: 0 })
  redemptionsCount: number;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: [String], default: [] })
  allowedEmails?: string[];
}

export const PromoCodeSchema = SchemaFactory.createForClass(PromoCode);
PromoCodeSchema.index({ isActive: 1, startsAt: 1, endsAt: 1 });
PromoCodeSchema.index({ appliesToType: 1, appliesToId: 1 });

