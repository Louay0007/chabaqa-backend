import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

/**
 * TTL-based deduplication log.
 * Keyed on (userId, dedupeKey). Documents auto-expire after `ttlSeconds`
 * to prevent repeated identical notifications from being sent in quick succession.
 */
@Schema({ timestamps: true, collection: 'notification_dedupe_log' })
export class NotificationDedupeLog extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId: MongooseSchema.Types.ObjectId;

  @Prop({ type: String, required: true })
  dedupeKey: string;

  @Prop({ type: Date, required: true, index: { expires: 0 } })
  expiresAt: Date;
}

export const NotificationDedupeLogSchema = SchemaFactory.createForClass(NotificationDedupeLog);

NotificationDedupeLogSchema.index({ userId: 1, dedupeKey: 1 }, { unique: true });
