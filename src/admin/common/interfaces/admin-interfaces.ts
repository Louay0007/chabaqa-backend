import { Types } from 'mongoose';
import { Request } from 'express';
import { AdminRole, AdminPermission } from '../../schemas/admin-user.schema';
import { AdminAction } from '../../schemas/audit-log.schema';
import type { AdminCapabilities, AdminSessionPayload } from '../../admin.service';

/**
 * Common interfaces used across the admin module
 */

/**
 * Time period enum for analytics and reporting
 */
export enum TimePeriod {
  LAST_7_DAYS = 'last_7_days',
  LAST_30_DAYS = 'last_30_days',
  LAST_90_DAYS = 'last_90_days',
  LAST_YEAR = 'last_year',
  CUSTOM = 'custom'
}

export interface AdminUserInfo {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  roles: string[];
  permissions: Array<AdminPermission | '*'>;
  isActive: boolean;
  lastLoginAt?: Date;
  lastActivityAt?: Date;
  email?: string;
  name?: string;
  role?: string;
  authSource?: 'legacy_admin' | 'admin_user';
  capabilities?: AdminCapabilities;
  user?: {
    _id: Types.ObjectId;
    name: string;
    email: string;
    role?: string;
    createdAt?: Date;
  };
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface DateRange {
  startDate?: Date;
  endDate?: Date;
}

export interface AdminActionContext {
  adminUserId: Types.ObjectId;
  ipAddress: string;
  userAgent: string;
  action: AdminAction;
  entityType: string;
  entityId: Types.ObjectId;
  metadata?: Record<string, any>;
}

export interface BulkOperationResult {
  totalItems: number;
  successCount: number;
  failureCount: number;
  failures: BulkOperationFailure[];
  summary: string;
}

export interface BulkOperationFailure {
  itemId: string;
  error: string;
  code?: string;
}

export interface FilterOptions {
  search?: string;
  status?: string[];
  dateRange?: DateRange;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface AdminResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: {
    code: string;
    details?: any;
  };
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AdminRequest extends Request {
  user: {
    id: string;
    _id?: string;
    userId?: string;
    sub?: string;
    email: string;
    role?: string;
    isAdmin?: boolean;
  };
  adminUser: AdminUserInfo;
  adminSession?: AdminSessionPayload;
}

export interface AuditContext {
  adminUserId: Types.ObjectId;
  action: AdminAction;
  entityType: string;
  entityId: Types.ObjectId;
  ipAddress: string;
  userAgent: string;
  previousData?: Record<string, any>;
  newData?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface SystemAlert {
  id: string;
  type: 'warning' | 'error' | 'info' | 'success';
  title: string;
  message: string;
  timestamp: Date;
  acknowledged: boolean;
  acknowledgedBy?: Types.ObjectId;
  acknowledgedAt?: Date;
  metadata?: Record<string, any>;
}

export interface AdminDashboardStats {
  totalUsers: number;
  activeUsers: number;
  totalCommunities: number;
  pendingApprovals: number;
  contentInQueue: number;
  totalRevenue: number;
  systemHealth: number;
  recentAlerts: SystemAlert[];
}

export interface ExportRequest {
  type: string;
  format: 'csv' | 'excel' | 'pdf' | 'json';
  filters?: Record<string, any>;
  fields?: string[];
}

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
  code?: string;
}

export interface AdminError {
  code: string;
  message: string;
  details?: any;
  timestamp: Date;
  adminUserId?: Types.ObjectId;
  context?: Record<string, any>;
}

// Type guards for better type safety
export function isAdminUserInfo(obj: any): obj is AdminUserInfo {
  return obj && 
    typeof obj._id === 'object' &&
    typeof obj.userId === 'object' &&
    Array.isArray(obj.roles) &&
    Array.isArray(obj.permissions) &&
    typeof obj.isActive === 'boolean';
}

export function isPaginatedResult<T>(obj: any): obj is PaginatedResult<T> {
  return obj &&
    Array.isArray(obj.data) &&
    typeof obj.total === 'number' &&
    typeof obj.page === 'number' &&
    typeof obj.limit === 'number' &&
    typeof obj.totalPages === 'number';
}

// Utility types for better type inference
export type AdminControllerMethod<T = any> = (
  req: AdminRequest,
  ...args: any[]
) => Promise<AdminResponse<T>>;

export type AdminServiceMethod<T = any> = (
  ...args: any[]
) => Promise<T>;

export type AdminGuardContext = {
  user: any;
  adminUser: AdminUserInfo;
  requiredRoles?: AdminRole[];
  requiredPermissions?: AdminPermission[];
};

// Constants for common admin operations
export const ADMIN_CONSTANTS = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  DEFAULT_SORT_ORDER: 'desc' as const,
  EXPORT_EXPIRY_HOURS: 24,
  AUDIT_LOG_RETENTION_DAYS: 365,
  MAX_BULK_OPERATION_SIZE: 1000,
} as const;

// Common error codes
export const ADMIN_ERROR_CODES = {
  UNAUTHORIZED: 'ADMIN_UNAUTHORIZED',
  FORBIDDEN: 'ADMIN_FORBIDDEN',
  NOT_FOUND: 'ADMIN_NOT_FOUND',
  VALIDATION_ERROR: 'ADMIN_VALIDATION_ERROR',
  BULK_OPERATION_ERROR: 'ADMIN_BULK_OPERATION_ERROR',
  EXPORT_ERROR: 'ADMIN_EXPORT_ERROR',
  AUDIT_LOG_ERROR: 'ADMIN_AUDIT_LOG_ERROR',
  SYSTEM_ERROR: 'ADMIN_SYSTEM_ERROR',
} as const;
