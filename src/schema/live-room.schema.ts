import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum LiveRoomStatus {
  SCHEDULED = 'scheduled',
  LIVE = 'live',
  ENDED = 'ended',
  CANCELLED = 'cancelled',
}

export enum LiveRoomType {
  BROADCAST = 'broadcast', // One-to-many (like YouTube Live)
  MEETING = 'meeting',     // Many-to-many (like Zoom)
}

// ─────────────────────────────────────────────────────────────────────────────
// LiveRoom schema
// ─────────────────────────────────────────────────────────────────────────────

@Schema({ timestamps: true, collection: 'live_rooms' })
export class LiveRoom {
  _id: Types.ObjectId;

  @Prop({ required: true, type: String, unique: true })
  roomId: string;

  @Prop({ required: true, type: String, ref: 'Community' })
  communityId: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  hostId: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 200 })
  title: string;

  @Prop({ type: String, maxlength: 2000 })
  description?: string;

  @Prop({ required: true, type: String, enum: Object.values(LiveRoomType), default: LiveRoomType.BROADCAST })
  roomType: LiveRoomType;

  @Prop({ required: true, type: String, enum: Object.values(LiveRoomStatus), default: LiveRoomStatus.SCHEDULED })
  status: LiveRoomStatus;

  @Prop({ type: String })
  thumbnailUrl?: string;

  @Prop({ type: String })
  coverImageUrl?: string;

  // Scheduling
  @Prop({ type: Date })
  scheduledAt?: Date;

  @Prop({ type: Date })
  startedAt?: Date;

  @Prop({ type: Date })
  endedAt?: Date;

  // LiveKit integration
  @Prop({ type: String })
  liveKitRoomName?: string;

  @Prop({ type: String })
  liveKitRoomSid?: string;

  // Access control
  @Prop({ type: Boolean, default: true })
  isPublic: boolean;

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  invitedUserIds: Types.ObjectId[];

  // Capacity
  @Prop({ type: Number, default: 100 })
  maxParticipants: number;

  // Recording
  @Prop({ type: Boolean, default: false })
  recordingEnabled: boolean;

  @Prop({ type: String })
  recordingUrl?: string;

  // Stats
  @Prop({ type: Number, default: 0 })
  viewerCount: number;

  @Prop({ type: Number, default: 0 })
  peakViewerCount: number;

  // Chat
  @Prop({ type: Boolean, default: true })
  chatEnabled: boolean;

  // Permissions
  @Prop({ type: Boolean, default: false })
  allowScreenShare: boolean;

  @Prop({ type: Boolean, default: false })
  allowQuestions: boolean;

  // Reactions
  @Prop({ type: Boolean, default: true })
  reactionsEnabled: boolean;
}

export interface LiveRoomDocument extends LiveRoom, Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const LiveRoomSchema = SchemaFactory.createForClass(LiveRoom);

LiveRoomSchema.index({ communityId: 1, status: 1 });
LiveRoomSchema.index({ communityId: 1, scheduledAt: 1 });
LiveRoomSchema.index({ hostId: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// LiveParticipant schema
// ─────────────────────────────────────────────────────────────────────────────

@Schema({ timestamps: true, collection: 'live_participants' })
export class LiveParticipant {
  _id: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ required: true, type: String })
  roomId: string;

  @Prop({ required: true, type: String, enum: ['host', 'speaker', 'viewer'] })
  role: 'host' | 'speaker' | 'viewer';

  @Prop({ type: Boolean, default: false })
  isMuted: boolean;

  @Prop({ type: Boolean, default: false })
  isVideoOn: boolean;

  @Prop({ type: Boolean, default: false })
  isScreenSharing: boolean;

  @Prop({ type: Date })
  joinedAt?: Date;

  @Prop({ type: Date })
  leftAt?: Date;

  @Prop({ type: Number, default: 0 })
  watchTimeSeconds: number;
}

export interface LiveParticipantDocument extends LiveParticipant, Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const LiveParticipantSchema = SchemaFactory.createForClass(LiveParticipant);
LiveParticipantSchema.index({ roomId: 1, userId: 1 });
