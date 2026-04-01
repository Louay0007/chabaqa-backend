import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PaymentMethodDocument = PaymentMethod & Document;

@Schema({ timestamps: true, collection: 'payment_methods' })
export class PaymentMethod {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  creatorId: Types.ObjectId;

  @Prop({ type: String, required: true })
  provider: string; // 'stripe'

  @Prop({ type: String })
  providerCustomerId?: string; // Stripe: cus_xxx

  @Prop({ type: String, required: true })
  providerPaymentMethodId: string; // Stripe: pm_xxx

  @Prop({ type: String })
  brand?: string; // visa, mastercard, amex, etc.

  @Prop({ type: String })
  last4?: string; // Last 4 digits

  @Prop({ type: Number })
  expMonth?: number;

  @Prop({ type: Number })
  expYear?: number;

  @Prop({ type: Boolean, default: false })
  isDefault: boolean;
}

export const PaymentMethodSchema = SchemaFactory.createForClass(PaymentMethod);

PaymentMethodSchema.index({ creatorId: 1, isDefault: -1 });
