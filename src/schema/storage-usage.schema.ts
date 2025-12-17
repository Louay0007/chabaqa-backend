import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StorageUsageDocument = StorageUsage & Document;

@Schema({ timestamps: true })
export class StorageUsage {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Number, required: true, default: 0 })
  usedBytes: number;
}

export const StorageUsageSchema = SchemaFactory.createForClass(StorageUsage);
StorageUsageSchema.index({ userId: 1 }, { unique: true });


