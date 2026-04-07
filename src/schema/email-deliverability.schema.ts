import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema()
export class EmailDeliverabilitySnapshot {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Community', index: true })
  communityId: Types.ObjectId;

  @Prop({ required: true, index: true })
  date: Date;

  @Prop({ default: 0 })
  sent: number;

  @Prop({ default: 0 })
  delivered: number;

  @Prop({ default: 0 })
  bounced: number;

  @Prop({ default: 0 })
  spamComplaints: number;

  @Prop({ default: 0 })
  unsubscribes: number;

  @Prop({ default: 0 })
  openRate: number;

  @Prop({ default: 0 })
  clickRate: number;

  @Prop({ default: 100 })
  deliverabilityScore: number;
}

export interface EmailDeliverabilitySnapshotDocument extends EmailDeliverabilitySnapshot, Document {}

export const EmailDeliverabilitySnapshotSchema = SchemaFactory.createForClass(EmailDeliverabilitySnapshot);

EmailDeliverabilitySnapshotSchema.index({ communityId: 1, date: 1 }, { unique: true });
