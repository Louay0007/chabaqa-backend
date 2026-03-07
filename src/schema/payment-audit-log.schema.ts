import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'payment_audit_logs' })
export class PaymentAuditLog {
  @Prop({ type: Types.ObjectId, ref: 'Order', required: false, index: true })
  orderId?: Types.ObjectId;

  @Prop({ type: String, required: true, index: true })
  eventType: string;

  @Prop({ type: String, required: false, index: true })
  provider?: string;

  @Prop({ type: String, required: false, index: true })
  eventId?: string;

  @Prop({ type: String, required: false })
  paymentMethod?: string;

  @Prop({ type: String, required: false })
  previousStatus?: string;

  @Prop({ type: String, required: false })
  nextStatus?: string;

  @Prop({ type: String, required: false })
  reason?: string;

  @Prop({ type: String, required: false })
  error?: string;

  @Prop({ type: Object, required: false, default: {} })
  metadata?: Record<string, any>;
}

export type PaymentAuditLogDocument = HydratedDocument<PaymentAuditLog>;

export const PaymentAuditLogSchema = SchemaFactory.createForClass(PaymentAuditLog);

PaymentAuditLogSchema.index({ provider: 1, eventId: 1 });
PaymentAuditLogSchema.index({ orderId: 1, createdAt: -1 });
