import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLog, AuditLogDocument, AdminAction } from '../../schemas/audit-log.schema';

export interface AuditLogEntry {
  adminUserId: Types.ObjectId;
  action: AdminAction;
  entityType: string;
  entityId: Types.ObjectId;
  previousData?: Record<string, any>;
  newData?: Record<string, any>;
  ipAddress: string;
  userAgent: string;
  metadata?: Record<string, any>;
  description?: string;
  status?: string;
  errorMessage?: string;
  requestData?: Record<string, any>;
  responseData?: Record<string, any>;
}

export interface AuditFilters {
  adminUserId?: string;
  action?: AdminAction;
  entityType?: string;
  entityId?: string;
  startDate?: Date;
  endDate?: Date;
  status?: string;
  ipAddress?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * AuditLogService handles comprehensive logging of all administrative actions
 * Provides audit trail functionality for security, compliance, and monitoring
 */
@Injectable()
export class AuditLogService {
  constructor(
    @InjectModel(AuditLog.name) private auditLogModel: Model<AuditLogDocument>,
  ) {}

  /**
   * Log an administrative action
   * @param entry - Audit log entry data
   */
  async logAction(entry: AuditLogEntry): Promise<AuditLog> {
    try {
      const auditLog = new this.auditLogModel({
        ...entry,
        timestamp: new Date(),
      });

      return await auditLog.save();
    } catch (error) {
      // Don't throw errors from audit logging to avoid breaking the main operation
      console.error('Failed to create audit log entry:', error);
      throw error;
    }
  }

  /**
   * Get audit trail with filtering and pagination
   * @param filters - Filter criteria
   * @param pagination - Pagination options
   */
  async getAuditTrail(
    filters: AuditFilters = {},
    pagination: PaginationOptions = {},
  ): Promise<PaginatedResult<AuditLog>> {
    const {
      page = 1,
      limit = 20,
      sortBy = 'timestamp',
      sortOrder = 'desc',
    } = pagination;

    // Build query
    const query: any = {};

    if (filters.adminUserId) {
      query.adminUserId = new Types.ObjectId(filters.adminUserId);
    }

    if (filters.action) {
      query.action = filters.action;
    }

    if (filters.entityType) {
      query.entityType = filters.entityType;
    }

    if (filters.entityId) {
      query.entityId = new Types.ObjectId(filters.entityId);
    }

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.ipAddress) {
      query.ipAddress = filters.ipAddress;
    }

    if (filters.startDate || filters.endDate) {
      query.timestamp = {};
      if (filters.startDate) {
        query.timestamp.$gte = filters.startDate;
      }
      if (filters.endDate) {
        query.timestamp.$lte = filters.endDate;
      }
    }

    // Build sort object
    const sort: any = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query with pagination
    const [data, total] = await Promise.all([
      this.auditLogModel
        .find(query)
        .populate('adminUser', 'userId roles')
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.auditLogModel.countDocuments(query),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get audit logs for a specific entity
   * @param entityType - Type of entity
   * @param entityId - ID of entity
   * @param pagination - Pagination options
   */
  async getEntityAuditTrail(
    entityType: string,
    entityId: string,
    pagination: PaginationOptions = {},
  ): Promise<PaginatedResult<AuditLog>> {
    return this.getAuditTrail(
      { entityType, entityId },
      pagination,
    );
  }

  /**
   * Get audit logs for a specific admin user
   * @param adminUserId - ID of admin user
   * @param pagination - Pagination options
   */
  async getAdminUserAuditTrail(
    adminUserId: string,
    pagination: PaginationOptions = {},
  ): Promise<PaginatedResult<AuditLog>> {
    return this.getAuditTrail(
      { adminUserId },
      pagination,
    );
  }

  /**
   * Get audit statistics
   */
  async getAuditStatistics(filters: AuditFilters = {}): Promise<any> {
    const query: any = {};

    if (filters.startDate || filters.endDate) {
      query.timestamp = {};
      if (filters.startDate) {
        query.timestamp.$gte = filters.startDate;
      }
      if (filters.endDate) {
        query.timestamp.$lte = filters.endDate;
      }
    }

    const [
      totalActions,
      actionsByType,
      actionsByStatus,
      actionsByAdmin,
    ] = await Promise.all([
      this.auditLogModel.countDocuments(query),
      this.auditLogModel.aggregate([
        { $match: query },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      this.auditLogModel.aggregate([
        { $match: query },
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      this.auditLogModel.aggregate([
        { $match: query },
        { $group: { _id: '$adminUserId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);

    return {
      totalActions,
      actionsByType,
      actionsByStatus,
      topAdminUsers: actionsByAdmin,
    };
  }

  /**
   * Export audit log data
   * @param filters - Filter criteria
   * @param format - Export format (csv, json)
   */
  async exportAuditLog(
    filters: AuditFilters = {},
    format: 'csv' | 'json' = 'csv',
  ): Promise<string> {
    const auditLogs = await this.auditLogModel
      .find(this.buildQuery(filters))
      .populate('adminUser', 'userId roles')
      .sort({ timestamp: -1 })
      .exec();

    if (format === 'json') {
      return JSON.stringify(auditLogs, null, 2);
    }

    // CSV format
    const headers = [
      'Timestamp',
      'Admin User ID',
      'Action',
      'Entity Type',
      'Entity ID',
      'Status',
      'IP Address',
      'User Agent',
      'Description',
    ];

    const csvRows = [
      headers.join(','),
      ...auditLogs.map(log => [
        log.timestamp.toISOString(),
        log.adminUserId.toString(),
        log.action,
        log.entityType,
        log.entityId.toString(),
        log.status || 'success',
        log.ipAddress,
        `"${log.userAgent}"`,
        `"${log.description || ''}"`,
      ].join(',')),
    ];

    return csvRows.join('\n');
  }

  private buildQuery(filters: AuditFilters): any {
    const query: any = {};

    if (filters.adminUserId) {
      query.adminUserId = new Types.ObjectId(filters.adminUserId);
    }

    if (filters.action) {
      query.action = filters.action;
    }

    if (filters.entityType) {
      query.entityType = filters.entityType;
    }

    if (filters.entityId) {
      query.entityId = new Types.ObjectId(filters.entityId);
    }

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.ipAddress) {
      query.ipAddress = filters.ipAddress;
    }

    if (filters.startDate || filters.endDate) {
      query.timestamp = {};
      if (filters.startDate) {
        query.timestamp.$gte = filters.startDate;
      }
      if (filters.endDate) {
        query.timestamp.$lte = filters.endDate;
      }
    }

    return query;
  }
}