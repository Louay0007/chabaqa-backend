import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CommunityGamificationConfig,
  CommunityGamificationConfigDocument,
} from '../schema/community-gamification-config.schema';
import {
  CommunityMemberGamification,
  CommunityMemberGamificationDocument,
} from '../schema/community-member-gamification.schema';
import {
  GamificationEvent,
  GamificationEventDocument,
  GamificationEventType,
} from '../schema/gamification-event.schema';
import { User, UserDocument } from '../schema/user.schema';
import { Community, CommunityDocument } from '../schema/community.schema';
import { RecordGamificationEventDto } from './dto/record-gamification-event.dto';
import { UpdateGamificationConfigDto } from './dto/update-gamification-config.dto';
import { AdminAdjustmentDto } from './dto/admin-adjustment.dto';
import {
  GamificationProfileDto,
  LeaderboardEntryDto,
  LeaderboardResponseDto,
} from './dto/gamification-response.dto';

const CAP_EXEMPT_EVENTS = new Set([
  GamificationEventType.ADMIN_ADJUSTMENT,
  GamificationEventType.COURSE_COMPLETED,
  GamificationEventType.CHALLENGE_COMPLETED,
  GamificationEventType.CHALLENGE_TASK_APPROVED,
  GamificationEventType.DAILY_LOGIN,
  GamificationEventType.STREAK_BONUS,
]);

@Injectable()
export class GamificationService {
  private readonly logger = new Logger(GamificationService.name);

  constructor(
    @InjectModel(CommunityGamificationConfig.name)
    private configModel: Model<CommunityGamificationConfigDocument>,
    @InjectModel(CommunityMemberGamification.name)
    private memberModel: Model<CommunityMemberGamificationDocument>,
    @InjectModel(GamificationEvent.name)
    private eventModel: Model<GamificationEventDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    @InjectModel(Community.name)
    private communityModel: Model<CommunityDocument>,
  ) {}

  // ─── Config Management ────────────────────────────────────────

  async getOrCreateConfig(
    communityId: string,
  ): Promise<CommunityGamificationConfigDocument> {
    let config = await this.configModel.findOne({
      communityId: new Types.ObjectId(communityId),
    });
    if (!config) {
      config = await this.configModel.create({
        communityId: new Types.ObjectId(communityId),
      });
    }
    return config;
  }

  async getConfigBySlug(
    communitySlug: string,
  ): Promise<CommunityGamificationConfigDocument> {
    const community = await this.resolveCommunityBySlug(communitySlug);
    return this.getOrCreateConfig(community._id.toString());
  }

  async updateConfig(
    communityId: string,
    dto: UpdateGamificationConfigDto,
  ): Promise<CommunityGamificationConfigDocument> {
    const config = await this.getOrCreateConfig(communityId);

    if (dto.enabled !== undefined) config.enabled = dto.enabled;
    if (dto.publicLeaderboard !== undefined)
      config.publicLeaderboard = dto.publicLeaderboard;
    if (dto.cooldownSeconds !== undefined)
      config.cooldownSeconds = dto.cooldownSeconds;

    if (dto.scoringWeights) {
      const sw = config.scoringWeights || ({} as any);
      Object.assign(sw, dto.scoringWeights);
      config.scoringWeights = sw;
    }

    if (dto.dailyCaps) {
      const dc = config.dailyCaps || ({} as any);
      Object.assign(dc, dto.dailyCaps);
      config.dailyCaps = dc;
    }

    if (dto.levelThresholds) {
      config.levelThresholds = dto.levelThresholds as any;
    }

    if (dto.unlockRules) {
      config.unlockRules = dto.unlockRules as any;
    }

    await config.save();
    return config;
  }

  // ─── Event Recording (Core Scoring Engine) ────────────────────

  async recordEvent(dto: RecordGamificationEventDto): Promise<void> {
    const communityId = dto.communityId;
    const config = await this.getOrCreateConfig(communityId);

    if (!config.enabled) {
      this.logger.debug(
        `Gamification disabled for community ${communityId}, skipping event`,
      );
      return;
    }

    // Determine the recipient (who gets points)
    const recipientId = dto.recipientUserId || dto.actorUserId;

    // Build idempotency key
    const idempotencyKey = this.buildIdempotencyKey(dto);

    // Calculate raw points before cap
    const rawPoints =
      dto.pointsOverride !== undefined
        ? dto.pointsOverride
        : this.calculatePoints(dto.eventType, config);

    // Admin adjustments: allow negative values and skip cap checks
    const isAdminAdjustment =
      dto.eventType === GamificationEventType.ADMIN_ADJUSTMENT;
    if (!isAdminAdjustment && rawPoints === 0) {
      this.logger.debug(`Zero points for event ${dto.eventType}, skipping`);
      return;
    }

    // ── Atomic daily cap check + increment via findOneAndUpdate ──
    let cappedPoints = rawPoints;

    if (!isAdminAdjustment && !CAP_EXEMPT_EVENTS.has(dto.eventType)) {
      cappedPoints = await this.atomicDailyCapCheck(
        communityId,
        recipientId,
        dto.eventType,
        rawPoints,
        config,
      );

      if (cappedPoints === 0) {
        this.logger.debug(
          `Daily cap reached for ${dto.eventType} user ${recipientId}`,
        );
        return;
      }
    }

    // ── Record the event (idempotency via unique index) ──────────
    try {
      await this.eventModel.create({
        eventType: dto.eventType,
        actorUserId: new Types.ObjectId(dto.actorUserId),
        recipientUserId: new Types.ObjectId(recipientId),
        communityId: new Types.ObjectId(communityId),
        sourceType: dto.sourceType,
        sourceId: dto.sourceId,
        pointsDelta: cappedPoints,
        idempotencyKey,
        metadata: dto.metadata,
      });
    } catch (err: any) {
      if (err.code === 11000) {
        this.logger.debug(
          `Duplicate event (race condition): ${idempotencyKey}`,
        );
        return;
      }
      throw err;
    }

    // ── Update member profile points + counters ──────────────────
    await this.applyPoints(
      communityId,
      recipientId,
      cappedPoints,
      dto.eventType,
    );

    // ── Check for level up and dispatch unlocks ──────────────────
    await this.recomputeLevel(communityId, recipientId, config);

    this.logger.log(
      `Gamification: ${dto.eventType} → ${cappedPoints >= 0 ? '+' : ''}${cappedPoints}pts ` +
        `to user ${recipientId} in community ${communityId}`,
    );
  }

  // ─── Streak Processing ────────────────────────────────────────

  async processLoginStreak(userId: string, communityId: string): Promise<void> {
    const config = await this.getOrCreateConfig(communityId);
    if (!config.enabled) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    // Atomic streak update: only proceed if lastStreakDate !== today
    const profile = await this.memberModel.findOneAndUpdate(
      {
        communityId: new Types.ObjectId(communityId),
        userId: new Types.ObjectId(userId),
        // Only update if we haven't counted today already
        $or: [
          { lastStreakDate: { $lt: today } },
          { lastStreakDate: null },
          { lastStreakDate: { $exists: false } },
        ],
      },
      {
        $setOnInsert: {
          communityId: new Types.ObjectId(communityId),
          userId: new Types.ObjectId(userId),
        },
      },
      { new: true, upsert: false },
    );

    // If no document matched → already processed today
    if (!profile) {
      // Try a plain findOne to see if it exists at all (new user)
      const existing = await this.memberModel.findOne({
        communityId: new Types.ObjectId(communityId),
        userId: new Types.ObjectId(userId),
      });
      if (existing) {
        // Already counted today
        return;
      }
    }

    // Re-fetch fresh profile for streak logic
    const freshProfile = await this.getOrCreateMemberProfile(
      communityId,
      userId,
    );

    const lastStreak = freshProfile.lastStreakDate
      ? new Date(freshProfile.lastStreakDate)
      : null;
    if (lastStreak) lastStreak.setHours(0, 0, 0, 0);

    // Already counted today check (double-guard)
    if (lastStreak && lastStreak.getTime() === today.getTime()) {
      return;
    }

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let newStreak: number;
    if (lastStreak && lastStreak.getTime() === yesterday.getTime()) {
      newStreak = freshProfile.streakCurrent + 1;
    } else {
      newStreak = 1;
    }

    // Persist streak atomically
    await this.memberModel.updateOne(
      {
        communityId: new Types.ObjectId(communityId),
        userId: new Types.ObjectId(userId),
      },
      {
        $set: {
          streakCurrent: newStreak,
          lastStreakDate: today,
          ...(newStreak > freshProfile.streakBest
            ? { streakBest: newStreak }
            : {}),
        },
      },
    );

    // Award daily streak points
    await this.recordEvent({
      eventType: GamificationEventType.DAILY_LOGIN,
      actorUserId: userId,
      communityId,
      sourceType: 'login',
      sourceId: `login:${userId}:${todayStr}`,
      metadata: { streak: newStreak },
    });

    // Weekly streak bonus (every 7th consecutive day)
    if (newStreak > 0 && newStreak % 7 === 0) {
      await this.recordEvent({
        eventType: GamificationEventType.STREAK_BONUS,
        actorUserId: userId,
        communityId,
        sourceType: 'streak',
        sourceId: `streak_bonus:${userId}:${newStreak}`,
        pointsOverride: config.scoringWeights?.weeklyStreakBonus ?? 15,
        metadata: { streak: newStreak },
      });
    }
  }

  // ─── Read APIs ────────────────────────────────────────────────

  async getMyProfile(
    userId: string,
    communitySlug: string,
  ): Promise<GamificationProfileDto> {
    const community = await this.resolveCommunityBySlug(communitySlug);
    const communityId = community._id.toString();
    const config = await this.getOrCreateConfig(communityId);
    const profile = await this.getOrCreateMemberProfile(communityId, userId);

    // Compute rank using all community members (same approach as the leaderboard),
    // so members without a gamification profile yet (score defaults to 0) are included.
    const rawMemberIds = [
      ...(Array.isArray((community as any)?.members)
        ? ((community as any).members as any[])
        : []),
      (community as any)?.createur,
    ]
      .filter(Boolean)
      .map((id: any) => String(id));
    const uniqueMemberIds = Array.from(new Set(rawMemberIds)).filter((id) =>
      Types.ObjectId.isValid(id),
    );

    // Fetch existing profiles so we know each member's totalPoints
    const existingProfiles = await this.memberModel
      .find({
        communityId: new Types.ObjectId(communityId),
        userId: { $in: uniqueMemberIds.map((id) => new Types.ObjectId(id)) },
      })
      .select('userId totalPoints leaderboardOptIn')
      .lean();
    const profilePointsMap = new Map(
      existingProfiles.map((p: any) => [
        String(p.userId),
        { totalPoints: Number(p.totalPoints || 0), leaderboardOptIn: p.leaderboardOptIn !== false },
      ]),
    );

    // Count how many community members (opted-in) have a higher totalPoints
    const membersAhead = uniqueMemberIds.filter((memberId) => {
      if (memberId === String(userId)) return false;
      const memberData = profilePointsMap.get(memberId);
      const memberPoints = memberData?.totalPoints ?? 0;
      const memberOptedIn = memberData?.leaderboardOptIn ?? true;
      return memberOptedIn && memberPoints > profile.totalPoints;
    }).length;

    const rank = membersAhead + 1;

    const { nextLevelName, nextLevelPoints, pointsToNextLevel, levelProgress } =
      this.computeLevelProgress(profile.totalPoints, profile.level, config);

    return {
      userId,
      communityId,
      totalPoints: profile.totalPoints,
      weeklyPoints: profile.weeklyPoints,
      level: profile.level,
      levelName: profile.levelName,
      nextLevelName,
      nextLevelPoints,
      pointsToNextLevel,
      levelProgress,
      streakCurrent: profile.streakCurrent,
      streakBest: profile.streakBest,
      rank,
      totalPostsCreated: profile.totalPostsCreated,
      totalCommentsCreated: profile.totalCommentsCreated,
      totalLikesReceived: profile.totalLikesReceived,
      totalCoursesCompleted: profile.totalCoursesCompleted,
      totalChallengesCompleted: profile.totalChallengesCompleted,
    };
  }

  async getUserProfile(
    targetUserId: string,
    communitySlug: string,
    requestingUserId?: string,
  ): Promise<GamificationProfileDto> {
    const community = await this.resolveCommunityBySlug(communitySlug);
    const communityId = community._id.toString();
    const config = await this.getOrCreateConfig(communityId);

    // Privacy: if leaderboard is private and requester is not the profile owner, block
    if (
      !config.publicLeaderboard &&
      requestingUserId &&
      requestingUserId !== targetUserId
    ) {
      throw new ForbiddenException(
        'This community has a private leaderboard. You can only view your own profile.',
      );
    }

    return this.getMyProfile(targetUserId, communitySlug);
  }

  async getLeaderboard(
    communitySlug: string,
    period: 'weekly' | 'all_time' = 'all_time',
    limit: number = 25,
    offset: number = 0,
    currentUserId?: string,
  ): Promise<LeaderboardResponseDto> {
    const community = await this.resolveCommunityBySlug(communitySlug);
    const communityId = community._id.toString();
    const config = await this.getOrCreateConfig(communityId);

    // ── Privacy gate ─────────────────────────────────────────────
    if (!config.publicLeaderboard) {
      // Return only the requesting user's own rank, no other entries
      const privateResponse: LeaderboardResponseDto = {
        entries: [],
        total: 0,
        period,
        isPrivate: true,
      };

      if (currentUserId) {
        const userProfile = await this.memberModel.findOne({
          communityId: new Types.ObjectId(communityId),
          userId: new Types.ObjectId(currentUserId),
        });
        if (userProfile) {
          const sortField =
            period === 'weekly' ? 'weeklyPoints' : 'totalPoints';
          const pointsField =
            period === 'weekly'
              ? userProfile.weeklyPoints
              : userProfile.totalPoints;
          privateResponse.currentUserRank =
            (await this.memberModel.countDocuments({
              communityId: new Types.ObjectId(communityId),
              leaderboardOptIn: true,
              [sortField]: { $gt: pointsField },
            })) + 1;
        }
      }

      return privateResponse;
    }

    const sortField = period === 'weekly' ? 'weeklyPoints' : 'totalPoints';
    // Include all community members (even if they have 0 points or no profile yet),
    // then merge with gamification profiles. This avoids empty leaderboards in
    // active communities where profiles are lazily created.
    const rawCommunityMemberIds = [
      ...(Array.isArray((community as any)?.members)
        ? ((community as any).members as any[])
        : []),
      (community as any)?.createur,
    ]
      .filter(Boolean)
      .map((id: any) => String(id));

    const uniqueCommunityMemberIds = Array.from(
      new Set(rawCommunityMemberIds),
    ).filter((id) => Types.ObjectId.isValid(id));

    if (uniqueCommunityMemberIds.length === 0) {
      return {
        entries: [],
        total: 0,
        period,
      };
    }

    const communityMemberObjectIds = uniqueCommunityMemberIds.map(
      (id) => new Types.ObjectId(id),
    );

    const [profiles, users] = await Promise.all([
      this.memberModel
        .find({
          communityId: new Types.ObjectId(communityId),
          userId: { $in: communityMemberObjectIds },
        })
        .lean(),
      this.userModel
        .find({ _id: { $in: communityMemberObjectIds } })
        .select('name email profile_picture photo_profil')
        .lean(),
    ]);

    const profileMap = new Map(
      profiles.map((profile: any) => [String(profile.userId), profile]),
    );
    const userMap = new Map(users.map((user: any) => [String(user._id), user]));

    const allRows = uniqueCommunityMemberIds
      .map((memberId) => {
        const profile: any = profileMap.get(memberId);
        const user: any = userMap.get(memberId);
        const score =
          sortField === 'weeklyPoints'
            ? Number(profile?.weeklyPoints || 0)
            : Number(profile?.totalPoints || 0);

        return {
          userId: memberId,
          userName: String(user?.name || 'Unknown'),
          userAvatar: String(user?.profile_picture || user?.photo_profil || ''),
          totalPoints: Number(profile?.totalPoints || 0),
          weeklyPoints: Number(profile?.weeklyPoints || 0),
          level: Number(profile?.level || 1),
          levelName: String(profile?.levelName || 'Newcomer'),
          streakCurrent: Number(profile?.streakCurrent || 0),
          leaderboardOptIn: profile?.leaderboardOptIn !== false,
          score,
        };
      })
      .filter((row) => row.leaderboardOptIn);

    allRows.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      return a.userName.localeCompare(b.userName);
    });

    const total = allRows.length;
    const pagedRows = allRows.slice(offset, offset + limit);

    const leaderboardEntries: LeaderboardEntryDto[] = pagedRows.map(
      (row, index) => ({
        rank: offset + index + 1,
        userId: row.userId,
        userName: row.userName,
        userAvatar: row.userAvatar,
        totalPoints: row.totalPoints,
        weeklyPoints: row.weeklyPoints,
        level: row.level,
        levelName: row.levelName,
        streakCurrent: row.streakCurrent,
      }),
    );

    let currentUserRank: number | undefined;
    if (currentUserId) {
      const normalizedCurrentUserId = String(currentUserId);
      const rankIndex = allRows.findIndex(
        (row) => row.userId === normalizedCurrentUserId,
      );
      if (rankIndex >= 0) {
        currentUserRank = rankIndex + 1;
      }
    }

    return {
      entries: leaderboardEntries,
      total,
      period,
      currentUserRank,
    };
  }

  // ─── Admin ────────────────────────────────────────────────────

  async adminAdjustment(
    communityId: string,
    dto: AdminAdjustmentDto,
    adminUserId: string,
  ): Promise<void> {
    // Verify recipient exists in community
    await this.getOrCreateMemberProfile(communityId, dto.userId);

    await this.recordEvent({
      eventType: GamificationEventType.ADMIN_ADJUSTMENT,
      actorUserId: adminUserId,
      recipientUserId: dto.userId,
      communityId,
      sourceType: 'admin_adjustment',
      // Use timestamp + admin + target to ensure uniqueness per operation
      sourceId: `admin:${adminUserId}:${dto.userId}:${Date.now()}`,
      pointsOverride: dto.pointsDelta,
      metadata: { reason: dto.reason, adjustedBy: adminUserId },
    });
  }

  async recomputeAllMembers(
    communityId: string,
  ): Promise<{ processed: number }> {
    const config = await this.getOrCreateConfig(communityId);
    const members = await this.memberModel.find({
      communityId: new Types.ObjectId(communityId),
    });

    for (const member of members) {
      const [allTimeResult, weeklyResult] = await Promise.all([
        this.eventModel.aggregate([
          {
            $match: {
              communityId: new Types.ObjectId(communityId),
              recipientUserId: member.userId,
            },
          },
          { $group: { _id: null, total: { $sum: '$pointsDelta' } } },
        ]),
        this.eventModel.aggregate([
          {
            $match: {
              communityId: new Types.ObjectId(communityId),
              recipientUserId: member.userId,
              createdAt: { $gte: this.getWeekStart() },
            },
          },
          { $group: { _id: null, total: { $sum: '$pointsDelta' } } },
        ]),
      ]);

      const totalPoints = allTimeResult[0]?.total || 0;
      const weeklyPoints = weeklyResult[0]?.total || 0;
      const { level, levelName } = this.computeLevel(totalPoints, config);
      const oldLevel = member.level || 1;

      await this.memberModel.updateOne(
        { _id: member._id },
        { $set: { totalPoints, weeklyPoints, level, levelName } },
      );

      // Dispatch unlock rules when level increases
      if (level > oldLevel) {
        this.logger.log(
          `🎉 Recompute level-up: user=${member.userId} community=${communityId} ` +
            `level=${oldLevel}→${level} (${levelName})`,
        );
        await this.dispatchLevelUpUnlocks(
          member.userId.toString(),
          communityId,
          level,
          config,
        );
      }
    }

    return { processed: members.length };
  }

  // ─── Weekly Reset ─────────────────────────────────────────────

  async resetWeeklyPoints(): Promise<void> {
    this.logger.log('Resetting weekly points for all communities');
    await this.memberModel.updateMany({}, { $set: { weeklyPoints: 0 } });
    this.logger.log('Weekly points reset complete');
  }

  // ─── Private Helpers ──────────────────────────────────────────

  /**
   * Atomic daily cap check using MongoDB conditional update.
   * Returns the points to award (rawPoints) or 0 if cap reached.
   * Race-safe: uses findOneAndUpdate with cap limit condition.
   */
  private async atomicDailyCapCheck(
    communityId: string,
    userId: string,
    eventType: GamificationEventType,
    rawPoints: number,
    config: CommunityGamificationConfigDocument,
  ): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    const caps = config.dailyCaps;

    let capField: string | null = null;
    let capLimit: number = Infinity;

    switch (eventType) {
      case GamificationEventType.POST_CREATED:
        capField = 'dailyPostsCreated';
        capLimit = caps?.postCreated ?? 5;
        break;
      case GamificationEventType.COMMENT_CREATED:
        capField = 'dailyCommentsCreated';
        capLimit = caps?.commentCreated ?? 20;
        break;
      case GamificationEventType.POST_LIKE_RECEIVED:
      case GamificationEventType.COMMENT_LIKE_RECEIVED:
        capField = 'dailyLikesReceived';
        capLimit = caps?.postLikeReceived ?? 50;
        break;
      default:
        return rawPoints; // no cap for this event type
    }

    // First ensure daily cap date is current (reset if stale)
    await this.memberModel.updateOne(
      {
        communityId: new Types.ObjectId(communityId),
        userId: new Types.ObjectId(userId),
        dailyCapDate: { $ne: today },
      },
      {
        $set: {
          dailyCapDate: today,
          dailyPostsCreated: 0,
          dailyCommentsCreated: 0,
          dailyLikesReceived: 0,
        },
        $setOnInsert: {
          communityId: new Types.ObjectId(communityId),
          userId: new Types.ObjectId(userId),
        },
      },
      { upsert: true },
    );

    // Atomically increment the cap counter only if under the limit
    const result = await this.memberModel.findOneAndUpdate(
      {
        communityId: new Types.ObjectId(communityId),
        userId: new Types.ObjectId(userId),
        dailyCapDate: today,
        [capField]: { $lt: capLimit },
      },
      {
        $inc: { [capField]: 1 },
        $setOnInsert: {
          communityId: new Types.ObjectId(communityId),
          userId: new Types.ObjectId(userId),
        },
      },
      { new: false, upsert: false },
    );

    // If no document matched, cap was reached
    return result ? rawPoints : 0;
  }

  private async getOrCreateMemberProfile(
    communityId: string,
    userId: string,
  ): Promise<CommunityMemberGamificationDocument> {
    let profile = await this.memberModel.findOne({
      communityId: new Types.ObjectId(communityId),
      userId: new Types.ObjectId(userId),
    });

    if (!profile) {
      try {
        profile = await this.memberModel.create({
          communityId: new Types.ObjectId(communityId),
          userId: new Types.ObjectId(userId),
        });
      } catch (err: any) {
        if (err.code === 11000) {
          // Race condition: another request created it concurrently
          profile = await this.memberModel.findOne({
            communityId: new Types.ObjectId(communityId),
            userId: new Types.ObjectId(userId),
          });
        } else {
          throw err;
        }
      }
    }

    return profile!;
  }

  private buildIdempotencyKey(dto: RecordGamificationEventDto): string {
    const parts = [dto.eventType, dto.actorUserId, dto.communityId];
    if (dto.recipientUserId) parts.push(dto.recipientUserId);
    if (dto.sourceId) parts.push(dto.sourceId);
    else parts.push(Date.now().toString());
    return parts.join(':');
  }

  private calculatePoints(
    eventType: GamificationEventType,
    config: CommunityGamificationConfigDocument,
  ): number {
    const w = config.scoringWeights;
    switch (eventType) {
      case GamificationEventType.POST_LIKE_RECEIVED:
        return w?.postLikeReceived ?? 1;
      case GamificationEventType.COMMENT_LIKE_RECEIVED:
        return w?.commentLikeReceived ?? 1;
      case GamificationEventType.POST_CREATED:
        return w?.postCreated ?? 2;
      case GamificationEventType.COMMENT_CREATED:
        return w?.commentCreated ?? 1;
      case GamificationEventType.COURSE_COMPLETED:
        return w?.courseCompleted ?? 50;
      case GamificationEventType.CHALLENGE_TASK_APPROVED:
        return w?.challengeTaskApproved ?? 0;
      case GamificationEventType.CHALLENGE_COMPLETED:
        return w?.challengeCompleted ?? 10;
      case GamificationEventType.DAILY_LOGIN:
        return w?.dailyLoginStreak ?? 2;
      case GamificationEventType.STREAK_BONUS:
        return w?.weeklyStreakBonus ?? 15;
      case GamificationEventType.ADMIN_ADJUSTMENT:
        return 0;
      default:
        return 0;
    }
  }

  private async applyPoints(
    communityId: string,
    userId: string,
    points: number,
    eventType: GamificationEventType,
  ): Promise<void> {
    const update: any = {
      $inc: { totalPoints: points, weeklyPoints: points },
      $set: { lastActivityDate: new Date() },
    };

    switch (eventType) {
      case GamificationEventType.POST_CREATED:
        update.$inc.totalPostsCreated = 1;
        break;
      case GamificationEventType.COMMENT_CREATED:
        update.$inc.totalCommentsCreated = 1;
        break;
      case GamificationEventType.POST_LIKE_RECEIVED:
      case GamificationEventType.COMMENT_LIKE_RECEIVED:
        update.$inc.totalLikesReceived = 1;
        break;
      case GamificationEventType.COURSE_COMPLETED:
        update.$inc.totalCoursesCompleted = 1;
        break;
      case GamificationEventType.CHALLENGE_COMPLETED:
        update.$inc.totalChallengesCompleted = 1;
        break;
    }

    await this.memberModel.updateOne(
      {
        communityId: new Types.ObjectId(communityId),
        userId: new Types.ObjectId(userId),
      },
      update,
      { upsert: true },
    );
  }

  private async recomputeLevel(
    communityId: string,
    userId: string,
    config: CommunityGamificationConfigDocument,
  ): Promise<void> {
    const profile = await this.memberModel.findOne({
      communityId: new Types.ObjectId(communityId),
      userId: new Types.ObjectId(userId),
    });
    if (!profile) return;

    const { level, levelName } = this.computeLevel(profile.totalPoints, config);

    if (level !== profile.level) {
      const oldLevel = profile.level;
      profile.level = level;
      profile.levelName = levelName;
      await profile.save();

      if (level > oldLevel) {
        this.logger.log(
          `🎉 Level-up: user=${userId} community=${communityId} ` +
            `level=${oldLevel}→${level} (${levelName})`,
        );
        await this.dispatchLevelUpUnlocks(userId, communityId, level, config);
      }
    }
  }

  /**
   * Process unlock rules for a given new level.
   * Idempotent: uses a unique event per unlock grant.
   */
  private async dispatchLevelUpUnlocks(
    userId: string,
    communityId: string,
    newLevel: number,
    config: CommunityGamificationConfigDocument,
  ): Promise<void> {
    const rules = (config.unlockRules || []).filter(
      (r) => r.level === newLevel,
    );
    if (rules.length === 0) return;

    for (const rule of rules) {
      const unlockKey = `unlock:${userId}:${communityId}:${newLevel}:${rule.targetType}:${rule.targetId || 'global'}`;

      // Idempotency: check if we already granted this unlock
      const alreadyGranted = await this.eventModel.findOne({
        idempotencyKey: unlockKey,
      });

      if (alreadyGranted) {
        this.logger.debug(`Unlock already granted: ${unlockKey}`);
        continue;
      }

      // Record the unlock as a zero-point admin event for audit trail
      try {
        await this.eventModel.create({
          eventType: GamificationEventType.ADMIN_ADJUSTMENT,
          actorUserId: new Types.ObjectId(userId),
          recipientUserId: new Types.ObjectId(userId),
          communityId: new Types.ObjectId(communityId),
          sourceType: 'level_unlock',
          sourceId: unlockKey,
          pointsDelta: 0,
          idempotencyKey: unlockKey,
          metadata: {
            unlockType: rule.targetType,
            unlockTarget: rule.targetId,
            level: newLevel,
            description: rule.description,
          },
        });

        this.logger.log(
          `🔓 Unlock granted: user=${userId} level=${newLevel} ` +
            `type=${rule.targetType} target=${rule.targetId || 'global'} ` +
            `desc="${rule.description || ''}"`,
        );

        // TODO: plug in access-grant services here:
        // switch (rule.targetType) {
        //   case 'course': await courseEnrollmentService.grantAccess(userId, rule.targetId); break;
        //   case 'badge':  await achievementService.grantBadge(userId, rule.targetId);       break;
        //   case 'role':   await communityAccessService.assignRole(userId, communityId, rule.targetId); break;
        // }
      } catch (err: any) {
        if (err.code === 11000) {
          this.logger.debug(
            `Unlock race condition (already granted): ${unlockKey}`,
          );
        } else {
          this.logger.error(`Failed to grant unlock ${unlockKey}:`, err);
        }
      }
    }
  }

  private computeLevel(
    totalPoints: number,
    config: CommunityGamificationConfigDocument,
  ): { level: number; levelName: string } {
    const thresholds = [...(config.levelThresholds || [])].sort(
      (a, b) => b.minPoints - a.minPoints,
    );

    for (const t of thresholds) {
      if (totalPoints >= t.minPoints) {
        return { level: t.level, levelName: t.name };
      }
    }

    return { level: 1, levelName: 'Newcomer' };
  }

  private computeLevelProgress(
    totalPoints: number,
    currentLevel: number,
    config: CommunityGamificationConfigDocument,
  ): {
    nextLevelName: string;
    nextLevelPoints: number;
    pointsToNextLevel: number;
    levelProgress: number;
  } {
    const sorted = [...(config.levelThresholds || [])].sort(
      (a, b) => a.minPoints - b.minPoints,
    );

    const currentIdx = sorted.findIndex((t) => t.level === currentLevel);
    const next = sorted[currentIdx + 1];

    if (!next) {
      return {
        nextLevelName: 'Max Level',
        nextLevelPoints: totalPoints,
        pointsToNextLevel: 0,
        levelProgress: 100,
      };
    }

    const currentMin = sorted[currentIdx]?.minPoints || 0;
    const range = next.minPoints - currentMin;
    const progress =
      range > 0
        ? Math.min(100, Math.round(((totalPoints - currentMin) / range) * 100))
        : 0;

    return {
      nextLevelName: next.name,
      nextLevelPoints: next.minPoints,
      pointsToNextLevel: Math.max(0, next.minPoints - totalPoints),
      levelProgress: progress,
    };
  }

  private getWeekStart(): Date {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  }

  private async resolveCommunityBySlug(
    slug: string,
  ): Promise<CommunityDocument> {
    const normalizedSlug = decodeURIComponent(slug).trim();
    const community = await this.communityModel.findOne({
      $or: [
        { slug: normalizedSlug },
        { slug: normalizedSlug.toLowerCase() },
        { nom: normalizedSlug },
      ],
    });
    if (!community) {
      throw new NotFoundException(`Community not found: ${slug}`);
    }
    return community;
  }
}
