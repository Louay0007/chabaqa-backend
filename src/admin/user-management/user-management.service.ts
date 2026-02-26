import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';

import { CreateUserDto } from '../../dto-user/create-user.dto';
import { UpdateUserDto } from '../../dto-user/update-user.dto';

// Import schemas and interfaces
import { User, UserDocument, UserRole } from '../../schema/user.schema';
import { AdminUser, AdminUserDocument } from '../schemas/admin-user.schema';
import { AuditLog } from '../schemas/audit-log.schema';

// Import DTOs
import { UserFiltersDto, UserStatus, SubscriptionType } from './dto/user-filters.dto';
import { SuspendUserDto, ActivateUserDto, ResetUserPasswordDto, UpdateAdminNotesDto } from './dto/user-actions.dto';

// Import services
import { AuditLogService } from '../common/services/audit-log.service';
import { EmailService } from '../../common/services/email.service';
import { AnalyticsService } from '../common/services/analytics.service';
import { generateUniqueUsername } from '../../common/utils/username.util';

// Import interfaces
import { PaginatedResult, TimePeriod } from '../common/interfaces/admin-interfaces';
import { AdminAction } from '../schemas/audit-log.schema';

/**
 * User details interface for admin view
 */
export interface UserDetails {
  _id: Types.ObjectId;
  name: string;
  email: string;
  role: UserRole;
  createdAt: Date;
  createdCommunities: Types.ObjectId[];
  joinedCommunities: Types.ObjectId[];
  adminCommunities: Types.ObjectId[];
  moderatorCommunities: Types.ObjectId[];
  purchasedProducts: Types.ObjectId[];
  numtel?: string;
  date_naissance?: Date;
  sexe?: string;
  pays?: string;
  ville?: string;
  code_postal?: string;
  adresse?: string;
  photo_profil?: string;
  bio?: string;
  lien_instagram?: string;
  profile_picture?: string;
  twoFactorEnabled: boolean;
  walletBalance: number;
  // Admin-specific fields
  isSuspended: boolean;
  suspensionReason?: string;
  suspensionEndDate?: Date;
  suspendedBy?: Types.ObjectId;
  adminNotes?: string;
  accountStatus: string;
  // Additional admin view fields
  activityHistory?: {
    lastLogin?: Date;
    loginCount?: number;
    postsCount?: number;
    communitiesCount?: number;
  };
  subscriptionStatus?: {
    type: SubscriptionType;
    startDate?: Date;
    endDate?: Date;
    isActive: boolean;
  };
  communityMemberships?: {
    communityId: Types.ObjectId;
    communityName: string;
    joinedAt: Date;
    role: string;
  }[];
}

/**
 * User analytics interface
 */
export interface UserAnalytics {
  totalUsers: number;
  activeUsers: number;
  newUsersThisMonth: number;
  userGrowthRate: number;
  usersByRole: Record<UserRole, number>;
  usersByStatus: Record<UserStatus, number>;
  retentionRate: number;
  averageLifetimeValue: number;
  engagementMetrics: {
    averageSessionDuration: number;
    averagePostsPerUser: number;
    averageCommunitiesPerUser: number;
  };
}

/**
 * User Management Service for Admin System
 * Provides comprehensive user administration capabilities
 */
@Injectable()
export class UserManagementService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(AdminUser.name) private adminUserModel: Model<AdminUserDocument>,
    private auditLogService: AuditLogService,
    private emailService: EmailService,
    private analyticsService: AnalyticsService,
  ) {}

  /**
   * Get users with advanced filtering and search
   * Requirement 1.1, 1.2
   */
  async getUsers(filters: UserFiltersDto): Promise<PaginatedResult<UserDocument>> {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      status,
      roles,
      subscriptionType,
      searchTerm,
      registrationDateRange
    } = filters;

    // Build query
    const query: any = {};

    // Status filter
    if (status && status.length > 0) {
      if (status.includes(UserStatus.SUSPENDED)) {
        query.isSuspended = true;
      } else {
        query.isSuspended = { $ne: true };
        if (status.length === 1) {
          query.accountStatus = status[0];
        } else {
          query.accountStatus = { $in: status };
        }
      }
    }

    // Role filter
    if (roles && roles.length > 0) {
      query.role = { $in: roles };
    }

    // Search term filter (name, email, username)
    if (searchTerm) {
      const searchRegex = new RegExp(searchTerm, 'i');
      query.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { username: searchRegex },
        { email: { $regex: `^${searchTerm}@`, $options: 'i' } }, // legacy handle search
      ];
    }

    // Registration date range filter
    if (registrationDateRange) {
      const dateFilter: any = {};
      if (registrationDateRange.startDate) {
        dateFilter.$gte = new Date(registrationDateRange.startDate);
      }
      if (registrationDateRange.endDate) {
        dateFilter.$lte = new Date(registrationDateRange.endDate);
      }
      if (Object.keys(dateFilter).length > 0) {
        query.createdAt = dateFilter;
      }
    }

    // Calculate pagination
    const skip = (page - 1) * limit;
    const sortOptions: any = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query
    const [users, total] = await Promise.all([
      this.userModel
        .find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .select('-password')
        .exec(),
      this.userModel.countDocuments(query)
    ]);

    return {
      data: users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page < Math.ceil(total / limit),
      hasPrevPage: page > 1
    };
  }

  /**
   * Get detailed user information
   * Requirement 1.3
   */
  async getUserDetails(userId: string): Promise<UserDetails> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID format');
    }

    const user = await this.userModel
      .findById(userId)
      .select('-password')
      .populate('createdCommunities', 'name createdAt')
      .populate('joinedCommunities', 'name')
      .exec();

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Get activity history
    const activityHistory = await this.getUserActivityHistory(userId);
    
    // Get subscription status (placeholder - would integrate with actual subscription system)
    const subscriptionStatus = await this.getUserSubscriptionStatus(userId);
    
    // Get community memberships with details
    const communityMemberships = await this.getUserCommunityMemberships(userId);

    return {
      ...user.toObject(),
      activityHistory,
      subscriptionStatus,
      communityMemberships
    };
  }

  /**
   * Suspend a user account
   * Requirement 1.4
   */
  async suspendUser(userId: string, suspendData: SuspendUserDto, adminId: string): Promise<void> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID format');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    if (user.isSuspended) {
      throw new BadRequestException('User is already suspended');
    }

    // Update user suspension status
    const updateData: any = {
      isSuspended: true,
      suspensionReason: suspendData.reason,
      suspendedBy: new Types.ObjectId(adminId),
      accountStatus: 'suspended'
    };

    if (suspendData.suspensionEndDate) {
      updateData.suspensionEndDate = new Date(suspendData.suspensionEndDate);
    }

    await this.userModel.findByIdAndUpdate(userId, updateData);

    // Log the action
    await this.auditLogService.logAction({
      adminUserId: new Types.ObjectId(adminId),
      action: AdminAction.USER_SUSPEND,
      entityType: 'User',
      entityId: new Types.ObjectId(userId),
      newData: { reason: suspendData.reason, suspensionEndDate: suspendData.suspensionEndDate },
      ipAddress: '', // Will be set by middleware
      userAgent: '', // Will be set by middleware
      metadata: { userId }
    });

    // Send notification email to user
    try {
      await this.emailService.sendAccountSuspensionEmail(
        user.email,
        user.name,
        suspendData.reason,
        suspendData.suspensionEndDate ? new Date(suspendData.suspensionEndDate) : undefined
      );
    } catch (error) {
      console.error('Failed to send suspension email:', error);
      // Don't throw error - suspension should still succeed
    }
  }

  /**
   * Activate a suspended user account
   * Requirement 1.5
   */
  async activateUser(userId: string, activateData: ActivateUserDto, adminId: string): Promise<void> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID format');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    if (!user.isSuspended) {
      throw new BadRequestException('User is not suspended');
    }

    // Update user activation status
    await this.userModel.findByIdAndUpdate(userId, {
      $set: {
        isSuspended: false,
        accountStatus: 'active'
      },
      $unset: {
        suspensionReason: 1,
        suspensionEndDate: 1,
        suspendedBy: 1
      }
    });

    // Log the action
    await this.auditLogService.logAction({
      adminUserId: new Types.ObjectId(adminId),
      action: AdminAction.USER_ACTIVATE,
      entityType: 'User',
      entityId: new Types.ObjectId(userId),
      newData: { reason: activateData.reason },
      ipAddress: '', // Will be set by middleware
      userAgent: '', // Will be set by middleware
      metadata: { userId }
    });

    // Send notification email to user
    try {
      await this.emailService.sendAccountActivationEmail(
        user.email,
        user.name,
        activateData.reason
      );
    } catch (error) {
      console.error('Failed to send activation email:', error);
      // Don't throw error - activation should still succeed
    }
  }

  /**
   * Reset user password
   * Requirement 1.6
   */
  async resetUserPassword(userId: string, resetData: ResetUserPasswordDto, adminId: string): Promise<{ temporaryPassword?: string }> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID format');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Generate temporary password
    const temporaryPassword = this.generateTemporaryPassword();
    const hashedPassword = await bcrypt.hash(temporaryPassword, 12);

    // Update user password
    await this.userModel.findByIdAndUpdate(userId, {
      password: hashedPassword
    });

    // Log the action
    await this.auditLogService.logAction({
      adminUserId: new Types.ObjectId(adminId),
      action: AdminAction.USER_PASSWORD_RESET,
      entityType: 'User',
      entityId: new Types.ObjectId(userId),
      newData: { reason: resetData.reason },
      ipAddress: '', // Will be set by middleware
      userAgent: '', // Will be set by middleware
      metadata: { userId }
    });

    // Send reset email if requested
    if (resetData.sendEmail !== false) {
      try {
        await this.emailService.sendPasswordResetByAdminEmail(
          user.email,
          user.name,
          temporaryPassword
        );
        return {}; // Don't return password if email sent
      } catch (error) {
        console.error('Failed to send password reset email:', error);
        // Return password if email failed
        return { temporaryPassword };
      }
    }

    return { temporaryPassword };
  }

  /**
   * Update admin notes for a user
   */
  async updateAdminNotes(userId: string, notesData: UpdateAdminNotesDto, adminId: string): Promise<void> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID format');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const previousNotes = user.adminNotes;
    await this.userModel.findByIdAndUpdate(userId, {
      adminNotes: notesData.notes
    });

    // Log the action
    await this.auditLogService.logAction({
      adminUserId: new Types.ObjectId(adminId),
      action: AdminAction.USER_UPDATE,
      entityType: 'User',
      entityId: new Types.ObjectId(userId),
      previousData: { adminNotes: previousNotes },
      newData: { adminNotes: notesData.notes },
      ipAddress: '', // Will be set by middleware
      userAgent: '', // Will be set by middleware
      metadata: { userId, field: 'adminNotes' }
    });
  }

  /**
   * Get user analytics
   * Requirement 1.7
   */
  async getUserAnalytics(period: TimePeriod = TimePeriod.LAST_30_DAYS): Promise<UserAnalytics> {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case TimePeriod.LAST_7_DAYS:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case TimePeriod.LAST_30_DAYS:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case TimePeriod.LAST_90_DAYS:
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case TimePeriod.LAST_YEAR:
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get total users
    const totalUsers = await this.userModel.countDocuments();

    // Get active users (users who logged in within the period)
    const activeUsers = await this.userModel.countDocuments({
      lastActive: { $gte: startDate }
    });

    // Get new users this month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const newUsersThisMonth = await this.userModel.countDocuments({
      createdAt: { $gte: monthStart }
    });

    // Calculate growth rate
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const newUsersPreviousMonth = await this.userModel.countDocuments({
      createdAt: { $gte: previousMonthStart, $lte: previousMonthEnd }
    });
    
    const userGrowthRate = newUsersPreviousMonth > 0 
      ? ((newUsersThisMonth - newUsersPreviousMonth) / newUsersPreviousMonth) * 100 
      : 0;

    // Get users by role
    const usersByRoleAgg = await this.userModel.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } }
    ]);
    const usersByRole = usersByRoleAgg.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {} as Record<UserRole, number>);

    // Get users by status
    const usersByStatusAgg = await this.userModel.aggregate([
      {
        $addFields: {
          status: {
            $cond: {
              if: '$isSuspended',
              then: 'suspended',
              else: '$accountStatus'
            }
          }
        }
      },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    const usersByStatus = usersByStatusAgg.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {} as Record<UserStatus, number>);

    // Calculate retention rate (simplified - users still active after 30 days)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const usersCreated30DaysAgo = await this.userModel.countDocuments({
      createdAt: { $lte: thirtyDaysAgo }
    });
    const activeUsersFrom30DaysAgo = await this.userModel.countDocuments({
      createdAt: { $lte: thirtyDaysAgo },
      lastActive: { $gte: thirtyDaysAgo }
    });
    const retentionRate = usersCreated30DaysAgo > 0 
      ? (activeUsersFrom30DaysAgo / usersCreated30DaysAgo) * 100 
      : 0;

    // Calculate engagement metrics
    const engagementMetrics = await this.calculateEngagementMetrics();

    return {
      totalUsers,
      activeUsers,
      newUsersThisMonth,
      userGrowthRate,
      usersByRole,
      usersByStatus,
      retentionRate,
      averageLifetimeValue: 0, // Placeholder - would calculate from actual revenue data
      engagementMetrics
    };
  }

  /**
   * Create a new user
   * Requirement: Admin CRUD
   */
  async createUser(createUserDto: CreateUserDto, adminId: string): Promise<UserDocument> {
    // Check if email already exists
    const existingUser = await this.userModel.findOne({ email: createUserDto.email });
    if (existingUser) {
      throw new BadRequestException('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(createUserDto.password, 12);
    const normalizedName = String(createUserDto.name || '').trim() || 'User';
    const username = await generateUniqueUsername(this.userModel, normalizedName);

    // Create user
    const newUser = new this.userModel({
      ...createUserDto,
      name: normalizedName,
      username,
      password: hashedPassword,
      isVerified: true, // Admin created users are auto-verified
      accountStatus: 'active'
    });

    await newUser.save();

    // Log action
    await this.auditLogService.logAction({
      adminUserId: new Types.ObjectId(adminId),
      action: AdminAction.USER_CREATE, // Ensure this enum exists or use USER_UPDATE as fallback
      entityType: 'User',
      entityId: newUser._id,
      newData: { email: newUser.email, role: newUser.role },
      ipAddress: '',
      userAgent: '',
      metadata: { userId: newUser._id.toString() }
    });

    return newUser;
  }

  /**
   * Update user profile
   * Requirement: Admin CRUD
   */
  async updateUser(userId: string, updateUserDto: UpdateUserDto, adminId: string): Promise<UserDocument> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID format');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const updateData: any = { ...updateUserDto };

    // If password is provided, hash it
    if (updateUserDto.password) {
      updateData.password = await bcrypt.hash(updateUserDto.password, 12);
    }

    // Perform update
    const updatedUser = await this.userModel.findByIdAndUpdate(
      userId,
      updateData,
      { new: true } // Return updated document
    ).select('-password');

    if (!updatedUser) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Log action
    await this.auditLogService.logAction({
      adminUserId: new Types.ObjectId(adminId),
      action: AdminAction.USER_UPDATE,
      entityType: 'User',
      entityId: new Types.ObjectId(userId),
      previousData: { email: user.email, role: user.role },
      newData: updateData,
      ipAddress: '',
      userAgent: '',
      metadata: { userId }
    });

    return updatedUser;
  }

  /**
   * Delete user (Hard Delete)
   * Requirement: Admin CRUD
   */
  async deleteUser(userId: string, adminId: string): Promise<void> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID format');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Delete user
    await this.userModel.findByIdAndDelete(userId);

    // Log action
    await this.auditLogService.logAction({
      adminUserId: new Types.ObjectId(adminId),
      action: AdminAction.USER_DELETE, // Ensure enum exists
      entityType: 'User',
      entityId: new Types.ObjectId(userId),
      previousData: { email: user.email, name: user.name },
      ipAddress: '',
      userAgent: '',
      metadata: { userId }
    });
  }

  /**
   * Private helper methods
   */
  private async getUserActivityHistory(userId: string) {
    // Placeholder - would integrate with actual activity tracking
    return {
      lastLogin: new Date(),
      loginCount: 0,
      postsCount: 0,
      communitiesCount: 0
    };
  }

  private async getUserSubscriptionStatus(userId: string) {
    // Placeholder - would integrate with actual subscription system
    return {
      type: SubscriptionType.FREE,
      isActive: true
    };
  }

  private async getUserCommunityMemberships(userId: string) {
    // Placeholder - would get actual community memberships
    return [];
  }

  private generateTemporaryPassword(): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  private async calculateEngagementMetrics() {
    try {
      // Get total users for averages
      const totalUsers = await this.userModel.countDocuments();
      
      if (totalUsers === 0) {
        return {
          averageSessionDuration: 0,
          averagePostsPerUser: 0,
          averageCommunitiesPerUser: 0
        };
      }

      // Calculate average communities per user
      const communityStats = await this.userModel.aggregate([
        {
          $project: {
            totalCommunities: {
              $add: [
                { $size: { $ifNull: ['$createdCommunities', []] } },
                { $size: { $ifNull: ['$joinedCommunities', []] } }
              ]
            }
          }
        },
        {
          $group: {
            _id: null,
            averageCommunities: { $avg: '$totalCommunities' }
          }
        }
      ]);

      const averageCommunitiesPerUser = communityStats.length > 0 
        ? communityStats[0].averageCommunities 
        : 0;

      // Try to get posts per user (if Post model exists)
      let averagePostsPerUser = 0;
      try {
        const Post = this.userModel.db.model('Post');
        const postStats = await Post.aggregate([
          {
            $group: {
              _id: '$authorId',
              postCount: { $sum: 1 }
            }
          },
          {
            $group: {
              _id: null,
              averagePosts: { $avg: '$postCount' }
            }
          }
        ]);
        
        averagePostsPerUser = postStats.length > 0 ? postStats[0].averagePosts : 0;
      } catch (error) {
        // Post model might not exist, use default value
        averagePostsPerUser = 0;
      }

      // Session duration would require session tracking - using placeholder
      const averageSessionDuration = 0; // Would calculate from actual session data

      return {
        averageSessionDuration,
        averagePostsPerUser,
        averageCommunitiesPerUser
      };
    } catch (error) {
      console.error('Error calculating engagement metrics:', error);
      return {
        averageSessionDuration: 0,
        averagePostsPerUser: 0,
        averageCommunitiesPerUser: 0
      };
    }
  }

  /**
   * Get detailed user growth metrics with trends
   */
  async getUserGrowthMetrics(period: TimePeriod = TimePeriod.LAST_30_DAYS): Promise<{
    totalUsers: number;
    newUsers: number;
    growthRate: number;
    dailyGrowth: { date: string; count: number }[];
    usersByRole: Record<UserRole, number>;
  }> {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case TimePeriod.LAST_7_DAYS:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case TimePeriod.LAST_30_DAYS:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case TimePeriod.LAST_90_DAYS:
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case TimePeriod.LAST_YEAR:
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get total users
    const totalUsers = await this.userModel.countDocuments();

    // Get new users in period
    const newUsers = await this.userModel.countDocuments({
      createdAt: { $gte: startDate }
    });

    // Calculate growth rate
    const previousPeriodStart = new Date(startDate.getTime() - (now.getTime() - startDate.getTime()));
    const previousPeriodUsers = await this.userModel.countDocuments({
      createdAt: { $gte: previousPeriodStart, $lt: startDate }
    });
    
    const growthRate = previousPeriodUsers > 0 
      ? ((newUsers - previousPeriodUsers) / previousPeriodUsers) * 100 
      : newUsers > 0 ? 100 : 0;

    // Get daily growth data
    const dailyGrowthData = await this.userModel.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt'
            }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    const dailyGrowth = dailyGrowthData.map(item => ({
      date: item._id,
      count: item.count
    }));

    // Get users by role
    const usersByRoleAgg = await this.userModel.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } }
    ]);
    const usersByRole = usersByRoleAgg.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {} as Record<UserRole, number>);

    return {
      totalUsers,
      newUsers,
      growthRate,
      dailyGrowth,
      usersByRole
    };
  }

  /**
   * Get user retention analysis
   */
  async getUserRetentionAnalysis(): Promise<{
    retentionRate: number;
    cohortAnalysis: {
      cohort: string;
      totalUsers: number;
      activeUsers: number;
      retentionRate: number;
    }[];
    churnRate: number;
  }> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Overall retention rate (users still active after 30 days)
    const usersCreated30DaysAgo = await this.userModel.countDocuments({
      createdAt: { $lte: thirtyDaysAgo }
    });
    
    const activeUsersFrom30DaysAgo = await this.userModel.countDocuments({
      createdAt: { $lte: thirtyDaysAgo },
      lastActive: { $gte: thirtyDaysAgo }
    });
    
    const retentionRate = usersCreated30DaysAgo > 0 
      ? (activeUsersFrom30DaysAgo / usersCreated30DaysAgo) * 100 
      : 0;

    // Cohort analysis by month
    const cohortData = await this.userModel.aggregate([
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m',
              date: '$createdAt'
            }
          },
          totalUsers: { $sum: 1 },
          activeUsers: {
            $sum: {
              $cond: [
                { $gte: ['$lastActive', thirtyDaysAgo] },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $addFields: {
          retentionRate: {
            $multiply: [
              { $divide: ['$activeUsers', '$totalUsers'] },
              100
            ]
          }
        }
      },
      {
        $sort: { _id: -1 }
      },
      {
        $limit: 12 // Last 12 months
      }
    ]);

    const cohortAnalysis = cohortData.map(item => ({
      cohort: item._id,
      totalUsers: item.totalUsers,
      activeUsers: item.activeUsers,
      retentionRate: item.retentionRate
    }));

    // Churn rate (users who haven't been active in 30 days)
    const totalUsers = await this.userModel.countDocuments();
    const inactiveUsers = await this.userModel.countDocuments({
      lastActive: { $lt: thirtyDaysAgo }
    });
    
    const churnRate = totalUsers > 0 ? (inactiveUsers / totalUsers) * 100 : 0;

    return {
      retentionRate,
      cohortAnalysis,
      churnRate
    };
  }

  /**
   * Get user lifetime value analysis
   */
  async getUserLifetimeValueAnalysis(): Promise<{
    averageLifetimeValue: number;
    lifetimeValueByRole: Record<UserRole, number>;
    lifetimeValueDistribution: {
      range: string;
      count: number;
      percentage: number;
    }[];
  }> {
    // This would integrate with actual revenue/subscription data
    // For now, providing placeholder structure
    
    const totalUsers = await this.userModel.countDocuments();
    const usersByRole = await this.userModel.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } }
    ]);

    // Placeholder calculations - would use actual revenue data
    const averageLifetimeValue = 0; // Would calculate from subscription/purchase data
    
    const lifetimeValueByRole = usersByRole.reduce((acc, item) => {
      acc[item._id] = 0; // Would calculate actual LTV by role
      return acc;
    }, {} as Record<UserRole, number>);

    const lifetimeValueDistribution = [
      { range: '$0-$10', count: 0, percentage: 0 },
      { range: '$10-$50', count: 0, percentage: 0 },
      { range: '$50-$100', count: 0, percentage: 0 },
      { range: '$100+', count: 0, percentage: 0 }
    ];

    return {
      averageLifetimeValue,
      lifetimeValueByRole,
      lifetimeValueDistribution
    };
  }
}
