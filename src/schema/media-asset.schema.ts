import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { MediaAssetStatus, MediaPurpose, MediaType, MediaVisibility } from '../media/media.types';

export type MediaAssetDocument = MediaAsset & Document;

@Schema({ timestamps: true })
export class MediaAsset {
  _id: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;

  @Prop({ type: String, enum: Object.values(MediaType), required: true })
  mediaType: MediaType;

  @Prop({ type: String, enum: Object.values(MediaPurpose), default: MediaPurpose.GENERIC, index: true })
  purpose: MediaPurpose;

  @Prop({ type: String, enum: Object.values(MediaVisibility), default: MediaVisibility.PUBLIC, index: true })
  visibility: MediaVisibility;

  @Prop({ type: String, enum: Object.values(MediaAssetStatus), default: MediaAssetStatus.UPLOADED, index: true })
  status: MediaAssetStatus;

  @Prop({ type: String, required: true })
  filename: string;

  @Prop({ type: String, required: true })
  originalName: string;

  @Prop({ type: String, required: true, index: true })
  storageKey: string;

  @Prop({ type: String, required: true })
  url: string;

  @Prop({ type: String, required: true })
  mimeType: string;

  @Prop({ type: Number, required: true })
  size: number;

  @Prop({ type: String })
  checksum?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  uploadedBy?: Types.ObjectId;

  @Prop({ type: String, index: true })
  entityType?: string;

  @Prop({ type: String, index: true })
  entityId?: string;

  @Prop({ type: Object, default: {} })
  metadata?: Record<string, any>;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export const MediaAssetSchema = SchemaFactory.createForClass(MediaAsset);
MediaAssetSchema.index({ entityType: 1, entityId: 1 });
MediaAssetSchema.index({ uploadedBy: 1, createdAt: -1 });
