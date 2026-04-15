import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum DataRegion {
  EU = 'eu',
  US = 'us',
  MEA = 'mea', // Middle East & Africa
  APAC = 'apac',
}

@Schema({ timestamps: true, collection: 'data_residency_settings' })
export class DataResidencySettings {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User', unique: true })
  userId: Types.ObjectId;

  @Prop({ required: true, type: String, enum: DataRegion, default: DataRegion.US })
  preferredRegion: DataRegion;

  @Prop({ type: String, enum: DataRegion })
  enforcedRegion?: DataRegion;

  @Prop({ type: Date, default: Date.now })
  lastMigratedAt?: Date;

  @Prop({
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'failed'],
  })
  migrationStatus?: 'pending' | 'in_progress' | 'completed' | 'failed';
}

export interface DataResidencySettingsDocument extends Document {
  userId: Types.ObjectId;
  preferredRegion: DataRegion;
  enforcedRegion?: DataRegion;
  lastMigratedAt?: Date;
  migrationStatus?: 'pending' | 'in_progress' | 'completed' | 'failed';
}

export const DataResidencySettingsSchema =
  SchemaFactory.createForClass(DataResidencySettings);

DataResidencySettingsSchema.index({ userId: 1 });
