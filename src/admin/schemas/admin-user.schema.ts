import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Admin roles for role-based access control
 */
export enum AdminRole {
  SUPER_ADMIN = 'super_admin',
  USER_MANAGER = 'user_manager',
  CONTENT_MODERATOR = 'content_moderator',
  FINANCIAL_MANAGER = 'financial_manager',
  COMMUNITY_MANAGER = 'community_manager',
  ANALYTICS_VIEWER = 'analytics_viewer',
  SECURITY_AUDITOR = 'security_auditor'
}

/**
 * Specific admin permissions for granular access control
 */
export enum AdminPermission {
  // User management permissions
  USER_CREATE = 'user_create',
  USER_READ = 'user_read',
  USER_SUSPEND = 'user_suspend',
  USER_ACTIVATE = 'user_activate',
  USER_PASSWORD_RESET = 'user_password_reset',
  USER_UPDATE = 'user_update',
  USER_DELETE = 'user_delete',
  VIEW_USERS = 'view_users',
  SUSPEND_USERS = 'suspend_users',
  ACTIVATE_USERS = 'activate_users',
  RESET_USER_PASSWORDS = 'reset_user_passwords',
  
  // Community management permissions
  VIEW_COMMUNITIES = 'view_communities',
  APPROVE_COMMUNITIES = 'approve_communities',
  REJECT_COMMUNITIES = 'reject_communities',
  MODERATE_COMMUNITIES = 'moderate_communities',
  
  // Content moderation permissions
  VIEW_CONTENT_QUEUE = 'view_content_queue',
  APPROVE_CONTENT = 'approve_content',
  REJECT_CONTENT = 'reject_content',
  BULK_MODERATE_CONTENT = 'bulk_moderate_content',
  
  // Financial management permissions
  VIEW_FINANCIAL_DATA = 'view_financial_data',
  PROCESS_PAYOUTS = 'process_payouts',
  HANDLE_DISPUTES = 'handle_disputes',
  GENERATE_FINANCIAL_REPORTS = 'generate_financial_reports',
  
  // Analytics permissions
  ANALYTICS_READ = 'analytics_read',
  VIEW_ANALYTICS = 'view_analytics',
  EXPORT_DATA = 'export_data',
  CONFIGURE_ALERTS = 'configure_alerts',
  
  // Security and audit permissions
  VIEW_AUDIT_LOGS = 'view_audit_logs',
  EXPORT_AUDIT_LOGS = 'export_audit_logs',
  MANAGE_ADMIN_USERS = 'manage_admin_users',
  
  // Communication permissions
  SEND_BULK_MESSAGES = 'send_bulk_messages',
  MANAGE_EMAIL_CAMPAIGNS = 'manage_email_campaigns',
  MANAGE_NOTIFICATIONS = 'manage_notifications',
}

export type AdminUserDocument = AdminUser & Document;

/**
 * AdminUser schema for enhanced role-based admin management
 * Links to existing User schema while adding admin-specific roles and permissions
 */
@Schema({ timestamps: true })
export class AdminUser {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId: Types.ObjectId;

  @Prop({ 
    type: [String], 
    enum: AdminRole, 
    required: true,
    validate: {
      validator: function(roles: AdminRole[]) {
        return roles && roles.length > 0;
      },
      message: 'At least one admin role is required'
    }
  })
  roles: AdminRole[];

  @Prop({ 
    type: [String], 
    enum: AdminPermission,
    default: []
  })
  permissions: AdminPermission[];

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Types.ObjectId, ref: 'AdminUser' })
  createdBy: Types.ObjectId;

  @Prop()
  lastLoginAt: Date;

  @Prop()
  lastActivityAt: Date;

  @Prop({ type: Object })
  metadata?: Record<string, any>;
}

export const AdminUserSchema = SchemaFactory.createForClass(AdminUser);

// Indexes for performance
AdminUserSchema.index({ userId: 1 }, { unique: true });
AdminUserSchema.index({ roles: 1 });
AdminUserSchema.index({ isActive: 1 });
AdminUserSchema.index({ createdBy: 1 });
AdminUserSchema.index({ lastActivityAt: -1 });

// Virtual for populated user data
AdminUserSchema.virtual('user', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true
});

// Ensure virtual fields are serialized
AdminUserSchema.set('toJSON', { virtuals: true });
AdminUserSchema.set('toObject', { virtuals: true });