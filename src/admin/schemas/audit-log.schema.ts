import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Administrative actions for audit logging
 */
export enum AdminAction {
  // User management actions
  USER_CREATE = 'user_create',
  USER_SUSPEND = 'user_suspend',
  USER_ACTIVATE = 'user_activate',
  USER_PASSWORD_RESET = 'user_password_reset',
  USER_VIEW_DETAILS = 'user_view_details',
  USER_SEARCH = 'user_search',
  USER_LIST = 'user_list',
  USER_VIEW = 'user_view',
  USER_UPDATE = 'user_update',
  USER_DELETE = 'user_delete',
  
  // Community management actions
  COMMUNITY_APPROVE = 'community_approve',
  COMMUNITY_REJECT = 'community_reject',
  COMMUNITY_VIEW = 'community_view',
  COMMUNITY_MODERATE = 'community_moderate',
  
  // Content moderation actions
  CONTENT_APPROVE = 'content_approve',
  CONTENT_REJECT = 'content_reject',
  CONTENT_SUSPEND = 'content_suspend',
  CONTENT_FEATURE = 'content_feature',
  CONTENT_UNFEATURE = 'content_unfeature',
  CONTENT_HIDE = 'content_hide',
  CONTENT_RESTORE = 'content_restore',
  CONTENT_DELETE = 'content_delete',
  CONTENT_UPDATE = 'content_update',
  CONTENT_CANCEL = 'content_cancel',
  CONTENT_NOTIFY = 'content_notify',
  CONTENT_FLAG = 'content_flag',
  CONTENT_ESCALATE = 'content_escalate',
  CONTENT_MODERATE = 'content_moderate',
  CONTENT_VIEW = 'content_view',
  CONTENT_MODERATION_VIEW = 'content_moderation_view',
  CONTENT_MODERATION_QUEUE_VIEW = 'content_moderation_queue_view',
  CONTENT_BULK_MODERATE = 'content_bulk_moderate',
  CONTENT_BULK_MODERATION = 'content_bulk_moderation',
  CONTENT_PRIORITY_UPDATE = 'content_priority_update',
  CONTENT_ASSIGNMENT = 'content_assignment',
  
  // Financial management actions
  PAYOUT_PROCESS = 'payout_process',
  FINANCIAL_VIEW = 'financial_view',
  DISPUTE_HANDLE = 'dispute_handle',
  FINANCIAL_REPORT_GENERATE = 'financial_report_generate',
  
  // Analytics and reporting actions
  ANALYTICS_VIEW = 'analytics_view',
  DATA_EXPORT = 'data_export',
  ALERT_CONFIGURE = 'alert_configure',
  
  // Security and audit actions
  AUDIT_LOG_VIEW = 'audit_log_view',
  AUDIT_LOG_EXPORT = 'audit_log_export',
  ADMIN_USER_CREATE = 'admin_user_create',
  ADMIN_USER_UPDATE = 'admin_user_update',
  ADMIN_USER_DELETE = 'admin_user_delete',
  
  // Communication actions
  BULK_MESSAGE_SEND = 'bulk_message_send',
  EMAIL_CAMPAIGN_CREATE = 'email_campaign_create',
  EMAIL_CAMPAIGN_SEND = 'email_campaign_send',
  NOTIFICATION_CONFIGURE = 'notification_configure',
  NOTIFICATION_CONFIG_CREATE = 'notification_config_create',
  NOTIFICATION_CONFIG_UPDATE = 'notification_config_update',
  NOTIFICATION_CONFIG_DELETE = 'notification_config_delete',
  EMAIL_TEMPLATE_CREATE = 'email_template_create',
  EMAIL_TEMPLATE_UPDATE = 'email_template_update',
  EMAIL_TEMPLATE_DELETE = 'email_template_delete',
  EMAIL_TEMPLATE_TEST = 'email_template_test',
  
  // System actions
  BULK_OPERATION = 'bulk_operation',
  SYSTEM_CONFIGURATION = 'system_configuration',
  LOGIN = 'login',
  LOGOUT = 'logout',
}

export type AuditLogDocument = AuditLog & Document;

/**
 * AuditLog schema for comprehensive administrative action logging
 * Tracks all admin actions for security, compliance, and audit purposes
 */
@Schema({ timestamps: true })
export class AuditLog {
  @Prop({ type: Types.ObjectId, ref: 'AdminUser', required: true })
  adminUserId: Types.ObjectId;

  @Prop({ required: true, type: String, enum: AdminAction })
  action: AdminAction;

  @Prop({ required: true })
  entityType: string;

  @Prop({ type: Types.ObjectId, required: true })
  entityId: Types.ObjectId;

  @Prop({ type: Object })
  previousData?: Record<string, any>;

  @Prop({ type: Object })
  newData?: Record<string, any>;

  @Prop({ required: true })
  ipAddress: string;

  @Prop({ required: true })
  userAgent: string;

  @Prop({ type: Object })
  metadata?: Record<string, any>;

  @Prop({ default: Date.now })
  timestamp: Date;

  @Prop()
  description?: string;

  @Prop({ default: 'success' })
  status: string; // success, failed, partial

  @Prop()
  errorMessage?: string;

  @Prop({ type: Object })
  requestData?: Record<string, any>;

  @Prop({ type: Object })
  responseData?: Record<string, any>;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

// Indexes for efficient querying and performance
AuditLogSchema.index({ adminUserId: 1, timestamp: -1 });
AuditLogSchema.index({ action: 1, timestamp: -1 });
AuditLogSchema.index({ entityType: 1, entityId: 1 });
AuditLogSchema.index({ timestamp: -1 });
AuditLogSchema.index({ ipAddress: 1 });
AuditLogSchema.index({ status: 1 });

// Compound indexes for common query patterns
AuditLogSchema.index({ adminUserId: 1, action: 1, timestamp: -1 });
AuditLogSchema.index({ entityType: 1, action: 1, timestamp: -1 });

// Virtual for populated admin user data
AuditLogSchema.virtual('adminUser', {
  ref: 'AdminUser',
  localField: 'adminUserId',
  foreignField: '_id',
  justOne: true
});

// Ensure virtual fields are serialized
AuditLogSchema.set('toJSON', { virtuals: true });
AuditLogSchema.set('toObject', { virtuals: true });