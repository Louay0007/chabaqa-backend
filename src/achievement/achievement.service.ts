import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Achievement, AchievementDocument, AchievementCriteriaType } from '../schema/achievement.schema';
import { UserAchievement, UserAchievementDocument } from '../schema/user-achievement.schema';
import { ProgressionService } from '../progression/progression.service';
import { Community } from '../schema/community.schema';
import { Post, PostDocument } from '../schema/post.schema';
import { UserLoginActivity, UserLoginActivityDocument } from '../schema/user-login-activity.schema';
import { User, UserDocument } from '../schema/user.schema';
import { CreateAchievementDto } from './dto/create-achievement.dto';
import { AchievementResponseDto, UserAchievementResponseDto, AchievementWithProgressDto } from './dto/achievement-response.dto';

@Injectable()
export class AchievementService {
  constructor(
    @InjectModel(Achievement.name) private achievementModel: Model<AchievementDocument>,
    @InjectModel(UserAchievement.name) private userAchievementModel: Model<UserAchievementDocument>,
    @InjectModel(Community.name) private communityModel: Model<Community>,
    @InjectModel(Post.name) private postModel: Model<PostDocument>,
    @InjectModel(UserLoginActivity.name) private userLoginActivityModel: Model<UserLoginActivityDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly progressionService: ProgressionService,
  ) {}

  /**
   * Validate achievement criteria
   */
  private validateCriteria(criteria: any): void {
    if (!criteria || !criteria.type) {
      throw new BadRequestException('Criteria must have a type');
    }

    const validTypes = Object.values(AchievementCriteriaType);
    if (!validTypes.includes(criteria.type)) {
      throw new BadRequestException(`Invalid criteria type: ${criteria.type}`);
    }

    // Add specific validations for each type
    switch (criteria.type) {
      case AchievementCriteriaType.COUNT_COMPLETED:
        if (!criteria.count || criteria.count < 1) {
          throw new BadRequestException('Count must be >= 1 for count_completed');
        }
        break;
      // Add more validations
    }
  }

  /**
   * Calculate progress for an achievement
   */
  private async calculateProgress(
    userId: string,
    communityId: string | undefined,
    achievement: AchievementResponseDto,
  ): Promise<{ current: number; target: number; percentage: number }> {
    const criteria = achievement.criteria;

    switch (criteria.type) {
      case AchievementCriteriaType.COUNT_COMPLETED:
        return await this.calculateCountCompletedProgress(userId, communityId, criteria);

      case AchievementCriteriaType.TIME_SPENT:
        return await this.calculateTimeSpentProgress(userId, communityId, criteria);

      case AchievementCriteriaType.COUNT_CREATED:
        return await this.calculateCountCreatedProgress(userId, communityId, criteria);

      case AchievementCriteriaType.POINTS_EARNED:
        return await this.calculatePointsEarnedProgress(userId, communityId, criteria);

      case AchievementCriteriaType.COMMUNITY_JOIN_DATE:
        return await this.calculateCommunityJoinDateProgress(userId, communityId, criteria);

      default:
        return { current: 0, target: criteria.count || 1, percentage: 0 };
    }
  }

  private async calculateCountCreatedProgress(
    userId: string,
    communityId: string | undefined,
    criteria: any,
  ): Promise<{ current: number; target: number; percentage: number }> {
    const target = criteria.count || 1;
    let current = 0;

    if (criteria.contentType === 'post') {
      const filter: any = {
        authorId: new Types.ObjectId(userId),
      };
      if (communityId) {
        filter.communityId = new Types.ObjectId(communityId);
      }
      current = await this.postModel.countDocuments(filter);
    } else if (criteria.contentType === 'comment') {
      const pipeline: any[] = [];
      if (communityId) {
        pipeline.push({ $match: { communityId: new Types.ObjectId(communityId) } });
      }
      pipeline.push(
        { $unwind: '$comments' },
        { $match: { 'comments.userId': new Types.ObjectId(userId) } },
        { $count: 'total' }
      );
      
      const result = await this.postModel.aggregate(pipeline);
      current = result.length > 0 ? result[0].total : 0;
    }

    return {
      current,
      target,
      percentage: Math.min((current / target) * 100, 100),
    };
  }

  private async calculatePointsEarnedProgress(
    userId: string,
    communityId: string | undefined,
    criteria: any,
  ): Promise<{ current: number; target: number; percentage: number }> {
    const target = criteria.points || 100;
    
    const user = await this.userModel.findById(userId).select('walletBalance totalPointsEarned');
    const current = user ? (user as any).totalPointsEarned || (user as any).walletBalance || 0 : 0;

    return {
      current,
      target,
      percentage: Math.min((current / target) * 100, 100),
    };
  }

  private async calculateCommunityJoinDateProgress(
    userId: string,
    communityId: string | undefined,
    criteria: any,
  ): Promise<{ current: number; target: number; percentage: number }> {
    const targetMonths = criteria.monthsSinceJoin || 1;
    const targetDays = criteria.days || (targetMonths * 30);
    
    if (!communityId) {
      return { current: 0, target: targetDays, percentage: 0 };
    }

    const activity = await this.userLoginActivityModel.findOne({
      userId: new Types.ObjectId(userId),
      communityId: new Types.ObjectId(communityId)
    });

    if (!activity || !activity.joinedAt) {
      return { current: 0, target: targetDays, percentage: 0 };
    }

    const joinDate = new Date(activity.joinedAt);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - joinDate.getTime());
    const currentDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return {
      current: currentDays,
      target: targetDays,
      percentage: Math.min((currentDays / targetDays) * 100, 100),
    };
  }

  private async calculateCountCompletedProgress(
    userId: string,
    communityId: string | undefined,
    criteria: any,
  ): Promise<{ current: number; target: number; percentage: number }> {
    const target = criteria.count || 1;
    let current = 0;

    if (criteria.contentType) {
      // Use progression service to count completed items
      const overview = await this.progressionService.getUserProgressOverview(userId, {
        communityId,
        contentTypes: criteria.contentType,
        page: 1,
        limit: 1000, // Get all completed items
      });

      current = overview.items.filter(item => item.status === 'completed').length;
    }

    return {
      current,
      target,
      percentage: Math.min((current / target) * 100, 100),
    };
  }

  private async calculateTimeSpentProgress(
    userId: string,
    communityId: string | undefined,
    criteria: any,
  ): Promise<{ current: number; target: number; percentage: number }> {
    const target = criteria.timeMinutes || 60; // minutes
    const current = 0;

    // This would need to be implemented based on tracking data
    // For now, return 0
    return {
      current,
      target,
      percentage: Math.min((current / target) * 100, 100),
    };
  }

  private mapToResponseDto(achievement: AchievementDocument): AchievementResponseDto {
    return {
      id: achievement.id,
      name: achievement.name,
      description: achievement.description,
      icon: achievement.icon,
      criteria: achievement.criteria,
      communityId: achievement.communityId?.toString(),
      isActive: achievement.isActive,
      rarity: achievement.rarity,
      points: achievement.points,
      tags: achievement.tags,
      order: achievement.order,
      createdAt: (achievement as any).createdAt,
      updatedAt: (achievement as any).updatedAt,
    };
  }

  private mapUserAchievementToResponseDto(ua: UserAchievementDocument): UserAchievementResponseDto {
    return {
      id: ua.id,
      userId: ua.userId.toString(),
      achievementId: ua.achievementId.toString(),
      communityId: ua.communityId.toString(),
      earnedAt: ua.earnedAt,
      metadata: ua.metadata,
      isPublic: ua.isPublic,
      sharedAt: ua.sharedAt,
      achievement: ua.achievementId ? this.mapToResponseDto(ua.achievementId as any) : undefined,
    };
  }

  /**
   * Create a new achievement
   */
  async create(createDto: CreateAchievementDto): Promise<AchievementResponseDto> {
    // Validate criteria
    this.validateCriteria(createDto.criteria);

    // Check if community exists if specified
    if (createDto.communityId) {
      const community = await this.communityModel.findById(createDto.communityId);
      if (!community) {
        throw new NotFoundException('Community not found');
      }
    }

    const achievement = new this.achievementModel({
      id: new Types.ObjectId().toString(),
      ...createDto,
      communityId: createDto.communityId ? new Types.ObjectId(createDto.communityId) : undefined,
    });

    const saved = await achievement.save();
    return this.mapToResponseDto(saved);
  }

  /**
   * Get achievements for a community
   */
  async getAchievementsForCommunity(communitySlug?: string): Promise<AchievementResponseDto[]> {
    let communityId: Types.ObjectId | undefined;

    if (communitySlug) {
      const community = await this.communityModel.findOne({ slug: communitySlug });
      if (!community) {
        throw new NotFoundException('Community not found');
      }
      communityId = community._id;
    }

    const filter: any = { isActive: true };
    if (communityId) {
      filter.$or = [
        { communityId },
        { communityId: { $exists: false } }, // Global achievements
      ];
    } else {
      filter.communityId = { $exists: false }; // Only global
    }

    const achievements = await this.achievementModel
      .find(filter)
      .sort({ order: 1, createdAt: -1 })
      .exec();

    return achievements.map(this.mapToResponseDto);
  }

  /**
   * Get user's achievements with progress for a community
   */
  async getUserAchievementsWithProgress(
    userId: string,
    communitySlug?: string,
  ): Promise<AchievementWithProgressDto[]> {
    let communityId: Types.ObjectId | undefined;

    if (communitySlug) {
      const community = await this.communityModel.findOne({ slug: communitySlug });
      if (!community) {
        throw new NotFoundException('Community not found');
      }
      communityId = community._id;
    }

    // Get available achievements (Global if no community, or Community+Global if community)
    const availableAchievements = await this.getAchievementsForCommunity(communitySlug);

    // Get user's earned achievements
    const filter: any = {
      userId: new Types.ObjectId(userId),
    };
    if (communityId) {
      filter.communityId = communityId;
    }

    const userAchievements = await this.userAchievementModel
      .find(filter)
      .populate('achievementId')
      .exec();

    const earnedMap = new Map(
      userAchievements.map(ua => [ua.achievementId.toString(), ua])
    );

    // Merge lists: Start with available achievements
    const allAchievements = new Map<string, AchievementResponseDto>();
    availableAchievements.forEach(a => allAchievements.set(a.id, a));

    // Add any earned achievement that is NOT in the available list (e.g. if we are in global view but user earned a community achievement)
    // Note: If communitySlug IS provided, availableAchievements should already cover everything relevant for that community.
    // But if communitySlug is NOT provided, availableAchievements only has Global ones. We want to include earned community achievements too.
    for (const ua of userAchievements) {
      const achievementDef = ua.achievementId as unknown as AchievementDocument;
      if (achievementDef && !allAchievements.has(achievementDef.id)) {
        allAchievements.set(achievementDef.id, this.mapToResponseDto(achievementDef));
      }
    }

    // Calculate progress for each achievement
    const results: AchievementWithProgressDto[] = [];

    for (const achievement of allAchievements.values()) {
      const userAchievement = earnedMap.get(achievement.id);

      if (userAchievement) {
        // Already earned
        results.push({
          ...achievement,
          isUnlocked: true,
          earnedAt: userAchievement.earnedAt,
          userAchievementId: userAchievement.id,
        });
      } else {
        // Calculate progress
        // Only calculate progress if it's in the available list (which implies it's relevant to current context)
        // If it was added because it was earned, we wouldn't be in this branch.
        
        const progress = await this.calculateProgress(userId, communityId?.toString(), achievement);
        results.push({
          ...achievement,
          isUnlocked: false,
          progress: progress.percentage,
          currentValue: progress.current,
          targetValue: progress.target,
        });
      }
    }

    return results.sort((a, b) => {
      // Sort by unlocked first, then by progress desc, then by order
      if (a.isUnlocked !== b.isUnlocked) return a.isUnlocked ? -1 : 1;
      if (!a.isUnlocked && a.progress !== b.progress) {
        return (b.progress || 0) - (a.progress || 0);
      }
      return (a.order || 0) - (b.order || 0);
    });
  }

  /**
   * Check and award achievements for a user in a community
   */
  async checkAchievements(userId: string, communityId: string): Promise<UserAchievementResponseDto[]> {
    const community = await this.communityModel.findById(communityId);
    if (!community) {
      throw new NotFoundException('Community not found');
    }

    const achievements = await this.achievementModel
      .find({
        isActive: true,
        $or: [
          { communityId: new Types.ObjectId(communityId) },
          { communityId: { $exists: false } },
        ],
      })
      .exec();

    const newAchievements: UserAchievementDocument[] = [];

    for (const achievement of achievements) {
      // Check if already earned
      const existing = await this.userAchievementModel.findOne({
        userId: new Types.ObjectId(userId),
        achievementId: achievement._id,
        communityId: new Types.ObjectId(communityId),
      });

      if (existing) continue;

      // Check if criteria met
      const progress = await this.calculateProgress(userId, communityId, this.mapToResponseDto(achievement));

      if (progress.percentage >= 100) {
        // Award achievement
        const userAchievement = new this.userAchievementModel({
          id: new Types.ObjectId().toString(),
          userId: new Types.ObjectId(userId),
          achievementId: achievement._id,
          communityId: new Types.ObjectId(communityId),
          earnedAt: new Date(),
          metadata: {
            progressAtEarn: progress.current,
            criteriaMet: achievement.criteria,
          },
        });

        await userAchievement.save();
        newAchievements.push(userAchievement);
      }
    }

    // Populate and return
    if (newAchievements.length > 0) {
      await this.userAchievementModel.populate(newAchievements, {
        path: 'achievementId',
        model: Achievement.name,
      });
    }

    return newAchievements.map(ua => this.mapUserAchievementToResponseDto(ua));
  }
}
