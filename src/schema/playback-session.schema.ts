import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PlaybackSessionDocument = PlaybackSession & Document;

export enum PlaybackSessionStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
}

@Schema({ timestamps: true })
export class PlaybackSession {
  _id: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: String, required: true, index: true })
  courseId: string;

  @Prop({ type: String, required: true })
  chapterId: string;

  /** Opaque session token used in URLs */
  @Prop({ type: String, required: true, unique: true, index: true })
  sessionToken: string;

  /** Storage key for the video file (e.g. "video/1234-uuid.mp4") */
  @Prop({ type: String, required: true })
  videoStorageKey: string;

  /** 'mp4' or 'hls' */
  @Prop({ type: String, required: true, default: 'mp4' })
  streamType: string;

  @Prop({
    type: String,
    enum: Object.values(PlaybackSessionStatus),
    default: PlaybackSessionStatus.ACTIVE,
    index: true,
  })
  status: PlaybackSessionStatus;

  @Prop({ type: Date, required: true, index: true })
  expiresAt: Date;

  /** SHA-256 hash of client IP for binding */
  @Prop({ type: String })
  ipHash?: string;

  /** SHA-256 hash of User-Agent for binding */
  @Prop({ type: String })
  uaHash?: string;

  /** Watermark text shown in player */
  @Prop({ type: String })
  watermarkText?: string;

  /** Short session identifier for watermark display */
  @Prop({ type: String })
  watermarkSessionShort?: string;

  /** Number of segment/byte requests served for this session */
  @Prop({ type: Number, default: 0 })
  requestCount: number;

  /** Last time this session was accessed */
  @Prop({ type: Date })
  lastAccessedAt?: Date;
}

export const PlaybackSessionSchema = SchemaFactory.createForClass(PlaybackSession);

// TTL index: auto-delete expired sessions after 1 hour past expiry
PlaybackSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });
// Compound index for concurrency checks
PlaybackSessionSchema.index({ userId: 1, status: 1, expiresAt: 1 });
// Compound index for session validation
PlaybackSessionSchema.index({ sessionToken: 1, status: 1 });
