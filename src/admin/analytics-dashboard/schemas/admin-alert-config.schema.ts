import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { AlertCondition, AlertMetricType, AlertSeverity } from '../dto/alert-config.dto';

export type AdminAlertConfigDocument = AdminAlertConfig & Document;

@Schema({ timestamps: true })
export class AdminAlertConfig {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  description: string;

  @Prop({ required: true, type: String, enum: AlertMetricType })
  metricType: AlertMetricType;

  @Prop({ required: true, type: String, enum: AlertCondition })
  condition: AlertCondition;

  @Prop({ required: true })
  threshold: number;

  @Prop({ required: true, type: String, enum: AlertSeverity })
  severity: AlertSeverity;

  @Prop({ default: true })
  isEnabled: boolean;

  @Prop({ type: [String], default: [] })
  notifyAdmins: string[];

  @Prop({ type: [String], default: [] })
  notifyEmails: string[];

  @Prop({ default: 0 })
  triggerCount: number;

  @Prop()
  lastTriggered?: Date;

  @Prop({ type: Types.ObjectId, required: true })
  createdBy: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

export const AdminAlertConfigSchema = SchemaFactory.createForClass(AdminAlertConfig);

AdminAlertConfigSchema.index({ metricType: 1, isEnabled: 1 });
AdminAlertConfigSchema.index({ createdBy: 1, createdAt: -1 });

