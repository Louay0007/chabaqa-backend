import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Achievement, AchievementDocument, AchievementCriteriaType } from '../schema/achievement.schema';
import { UserAchievement, UserAchievementDocument } from '../schema/user-achievement.schema';
import { ProgressionService } from '../progression/progression.service';
import { Community } from '../schema/community.schema';
import { CreateAchievementDto } from './dto/create-achievement.dto';
import { AchievementResponseDto, UserAchievementResponseDto, AchievementWithProgressDto } from './dto/achievement-response.dto';

@Injectable()
export class AchievementService {
  constructor(
    @InjectModel(Achievement.name) private achievementModel: Model<AchievementDocument>,
    @InjectModel(UserAchievement.name) private userAchievementModel: Model<UserAchievementDocument>,
    @InjectModel(Community.name) private communityModel: Model<Community>,
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
    communityId: string,
    achievement: AchievementResponseDto,
  ): Promise<{ current: number; target: number; percentage: number }> {
    const criteria = achievement.criteria;

    switch (criteria.type) {
      case AchievementCriteriaType.COUNT_COMPLETED:
        return await this.calculateCountCompletedProgress(userId, communityId, criteria);

      case AchievementCriteriaType.TIME_SPENT:
        return await this.calculateTimeSpentProgress(userId, communityId, criteria);

      // Add more criteria types as needed
      default:
        return { current: 0, target: criteria.count || 1, percentage: 0 };
    }
  }

  private async calculateCountCompletedProgress(
    userId: string,
    communityId: string,
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
    communityId: string,
    criteria: any,
  ): Promise<{ current: number; target: number; percentage: number }> {
    const target = criteria.timeMinutes || 60; // minutes
    let current = 0;

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
    communitySlug: string,
  ): Promise<AchievementWithProgressDto[]> {
    const community = await this.communityModel.findOne({ slug: communitySlug });
    if (!community) {
      throw new NotFoundException('Community not found');
    }

    const communityId = community._id;

    // Get all achievements for this community
    const achievements = await this.getAchievementsForCommunity(communitySlug);

    // Get user's earned achievements
    const userAchievements = await this.userAchievementModel
      .find({
        userId: new Types.ObjectId(userId),
        communityId,
      })
      .populate('achievementId')
      .exec();

    const earnedMap = new Map(
      userAchievements.map(ua => [ua.achievementId.toString(), ua])
    );

    // Calculate progress for each achievement
    const results: AchievementWithProgressDto[] = [];

    for (const achievement of achievements) {
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
        const progress = await this.calculateProgress(userId, communityId.toString(), achievement);
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