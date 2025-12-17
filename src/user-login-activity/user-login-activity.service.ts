import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { 
  UserLoginActivity, 
  UserLoginActivityDocument 
} from '../schema/user-login-activity.schema';
import { User, UserDocument } from '../schema/user.schema';
import { Community, CommunityDocument } from '../schema/community.schema';

/**
 * Service for managing user login activity tracking
 * Handles inactive user detection and reactivation targeting
 */
@Injectable()
export class UserLoginActivityService {
  private readonly logger = new Logger(UserLoginActivityService.name);

  constructor(
    @InjectModel(UserLoginActivity.name) 
    private userLoginActivityModel: Model<UserLoginActivityDocument>,
    @InjectModel(User.name) 
    private userModel: Model<UserDocument>,
    @InjectModel(Community.name) 
    private communityModel: Model<CommunityDocument>,
  ) {}

  /**
   * Track user login for a specific community
   * Call this when user logs in successfully
   */
  async trackUserLogin(userId: string, communityId: string): Promise<void> {
    try {
      const existingActivity = await this.userLoginActivityModel.findOne({
        userId: new Types.ObjectId(userId),
        communityId: new Types.ObjectId(communityId)
      });

      const now = new Date();

      if (existingActivity) {
        // Update existing record
        existingActivity.lastLoginAt = now;
        existingActivity.daysSinceLastLogin = 0;
        existingActivity.inactivityStatus = 'active';
        existingActivity.isReactivationTarget = false;
        await existingActivity.save();
        
        this.logger.log(`Updated login activity for user ${userId} in community ${communityId}`);
      } else {
        // Create new record
        const newActivity = new this.userLoginActivityModel({
          userId: new Types.ObjectId(userId),
          communityId: new Types.ObjectId(communityId),
          lastLoginAt: now,
          daysSinceLastLogin: 0,
          inactivityStatus: 'active',
          isReactivationTarget: false,
          joinedAt: now
        });
        await newActivity.save();
        
        this.logger.log(`Created new login activity for user ${userId} in community ${communityId}`);
      }
    } catch (error) {
      this.logger.error(`Error tracking login for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Track user login for all communities they're member of
   * Call this after successful authentication
   */
  async trackUserLoginForAllCommunities(userId: string): Promise<void> {
    try {
      // Get all communities where user is a member
      const userCommunities = await this.communityModel.find({
        members: new Types.ObjectId(userId)
      }).select('_id');

      // Track login for each community
      const promises = userCommunities.map(community => 
        this.trackUserLogin(userId, community._id.toString())
      );

      await Promise.all(promises);
      
      this.logger.log(`Tracked login for user ${userId} across ${userCommunities.length} communities`);
    } catch (error) {
      this.logger.error(`Error tracking login for all communities for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Update inactivity status for all users
   * Run this daily via cron job
   */
  async updateInactivityStatus(): Promise<void> {
    try {
      this.logger.log('Starting inactivity status update...');
      
      const activities = await this.userLoginActivityModel.find();
      const now = new Date();
      let updatedCount = 0;

      for (const activity of activities) {
        const daysSinceLogin = Math.floor(
          (now.getTime() - activity.lastLoginAt.getTime()) / (1000 * 60 * 60 * 24)
        );

        const oldStatus = activity.inactivityStatus;
        
        activity.daysSinceLastLogin = daysSinceLogin;

        // Update inactivity status based on days since login
        if (daysSinceLogin <= 7) {
          activity.inactivityStatus = 'active';
          activity.isReactivationTarget = false;
        } else if (daysSinceLogin <= 15) {
          activity.inactivityStatus = 'inactive_7d';
          activity.isReactivationTarget = true;
        } else if (daysSinceLogin <= 30) {
          activity.inactivityStatus = 'inactive_15d';
          activity.isReactivationTarget = true;
        } else if (daysSinceLogin <= 60) {
          activity.inactivityStatus = 'inactive_30d';
          activity.isReactivationTarget = true;
        } else {
          activity.inactivityStatus = 'inactive_60d_plus';
          activity.isReactivationTarget = true;
        }

        // Only save if status changed
        if (oldStatus !== activity.inactivityStatus) {
          await activity.save();
          updatedCount++;
        }
      }

      this.logger.log(`Inactivity status update completed. Updated ${updatedCount} users.`);
    } catch (error) {
      this.logger.error('Error updating inactivity status:', error);
      throw error;
    }
  }

  /**
   * Get inactive users by period for a specific community
   */
  async getInactiveUsersByPeriod(
    communityId: string, 
    inactivityPeriod: string
  ): Promise<UserLoginActivityDocument[]> {
    try {
      let statusQuery: string;

      switch (inactivityPeriod) {
        case 'last_7_days':
          statusQuery = 'inactive_7d';
          break;
        case 'last_15_days':
          statusQuery = 'inactive_15d';
          break;
        case 'last_30_days':
          statusQuery = 'inactive_30d';
          break;
        case 'last_60_days':
          statusQuery = 'inactive_30d'; // Same as 30d for now
          break;
        case 'more_than_60_days':
          statusQuery = 'inactive_60d_plus';
          break;
        default:
          statusQuery = 'inactive_7d';
      }

      const inactiveUsers = await this.userLoginActivityModel
        .find({
          communityId: new Types.ObjectId(communityId),
          inactivityStatus: statusQuery,
          isReactivationTarget: true
        })
        .populate('userId', 'name email')
        .sort({ daysSinceLastLogin: -1 })
        .exec();

      this.logger.log(`Found ${inactiveUsers.length} inactive users for period ${inactivityPeriod} in community ${communityId}`);
      return inactiveUsers;
    } catch (error) {
      this.logger.error(`Error getting inactive users for period ${inactivityPeriod}:`, error);
      throw error;
    }
  }

  /**
   * Get all inactive users for a community (any period)
   */
  async getAllInactiveUsers(communityId: string): Promise<UserLoginActivityDocument[]> {
    try {
      const inactiveUsers = await this.userLoginActivityModel
        .find({
          communityId: new Types.ObjectId(communityId),
          inactivityStatus: { $ne: 'active' },
          isReactivationTarget: true
        })
        .populate('userId', 'name email')
        .sort({ daysSinceLastLogin: -1 })
        .exec();

      this.logger.log(`Found ${inactiveUsers.length} total inactive users in community ${communityId}`);
      return inactiveUsers;
    } catch (error) {
      this.logger.error(`Error getting all inactive users for community ${communityId}:`, error);
      throw error;
    }
  }

  /**
   * Get inactivity statistics for a community
   */
  async getInactivityStats(communityId: string): Promise<any> {
    try {
      const stats = await this.userLoginActivityModel.aggregate([
        { $match: { communityId: new Types.ObjectId(communityId) } },
        {
          $group: {
            _id: '$inactivityStatus',
            count: { $sum: 1 },
            avgDaysSinceLogin: { $avg: '$daysSinceLastLogin' }
          }
        }
      ]);

      const totalMembers = await this.userLoginActivityModel.countDocuments({
        communityId: new Types.ObjectId(communityId)
      });

      const result = {
        totalMembers,
        activeUsers: stats.find(s => s._id === 'active')?.count || 0,
        inactive7d: stats.find(s => s._id === 'inactive_7d')?.count || 0,
        inactive15d: stats.find(s => s._id === 'inactive_15d')?.count || 0,
        inactive30d: stats.find(s => s._id === 'inactive_30d')?.count || 0,
        inactive60dPlus: stats.find(s => s._id === 'inactive_60d_plus')?.count || 0,
        totalInactiveUsers: stats
          .filter(s => s._id !== 'active')
          .reduce((sum, s) => sum + s.count, 0),
        breakdown: stats
      };

      this.logger.log(`Retrieved inactivity stats for community ${communityId}: ${result.totalInactiveUsers} inactive users`);
      return result;
    } catch (error) {
      this.logger.error(`Error getting inactivity stats for community ${communityId}:`, error);
      throw error;
    }
  }

  /**
   * Update reactivation email tracking
   */
  async updateReactivationEmailSent(
    userId: string, 
    communityId: string
  ): Promise<void> {
    try {
      await this.userLoginActivityModel.updateOne(
        {
          userId: new Types.ObjectId(userId),
          communityId: new Types.ObjectId(communityId)
        },
        {
          $set: { lastReactivationEmailSent: new Date() },
          $inc: { reactivationEmailCount: 1 }
        }
      );

      this.logger.log(`Updated reactivation email tracking for user ${userId} in community ${communityId}`);
    } catch (error) {
      this.logger.error(`Error updating reactivation email tracking:`, error);
      throw error;
    }
  }

  /**
   * Get user activity for a specific user-community pair
   */
  async getUserActivity(userId: string, communityId: string): Promise<UserLoginActivityDocument | null> {
    try {
      const activity = await this.userLoginActivityModel
        .findOne({
          userId: new Types.ObjectId(userId),
          communityId: new Types.ObjectId(communityId)
        })
        .populate('userId', 'name email')
        .populate('communityId', 'name slug')
        .exec();

      return activity;
    } catch (error) {
      this.logger.error(`Error getting user activity:`, error);
      throw error;
    }
  }

  /**
   * Daily cron job to update inactivity status
   */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async handleDailyInactivityUpdate(): Promise<void> {
    try {
      this.logger.log('🔄 Starting daily inactivity status update...');
      await this.updateInactivityStatus();
      this.logger.log('✅ Daily inactivity status update completed');
    } catch (error) {
      this.logger.error('❌ Error in daily inactivity update:', error);
    }
  }

  /**
   * Weekly cron job to send inactivity reports to community creators
   */
  @Cron('0 9 * * 1') // Every Monday at 9 AM
  async handleWeeklyInactivityReport(): Promise<void> {
    try {
      this.logger.log('📊 Starting weekly inactivity report generation...');
      
      // Get all communities with inactive users
      const communitiesWithInactiveUsers = await this.userLoginActivityModel.aggregate([
        {
          $match: {
            inactivityStatus: { $ne: 'active' },
            isReactivationTarget: true
          }
        },
        {
          $group: {
            _id: '$communityId',
            inactiveCount: { $sum: 1 }
          }
        }
      ]);

      this.logger.log(`Found ${communitiesWithInactiveUsers.length} communities with inactive users`);
      
      // TODO: Implement email reports to community creators
      // This would send weekly reports about inactive users to community creators
      
      this.logger.log('✅ Weekly inactivity report generation completed');
    } catch (error) {
      this.logger.error('❌ Error in weekly inactivity report:', error);
    }
  }
}
