import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { GamificationService } from './gamification.service';
import { CommunityGamificationConfig } from '../schema/community-gamification-config.schema';
import { CommunityMemberGamification } from '../schema/community-member-gamification.schema';
import {
  GamificationEvent,
  GamificationEventType,
} from '../schema/gamification-event.schema';
import { User } from '../schema/user.schema';
import { Community } from '../schema/community.schema';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

// Helper factory for mock models
const mockModel = (overrides: Record<string, any> = {}) => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn(),
  updateMany: jest.fn(),
  countDocuments: jest.fn(),
  aggregate: jest.fn(),
  save: jest.fn(),
  ...overrides,
});

const mockCommunityId = new Types.ObjectId().toString();
const mockUserId = new Types.ObjectId().toString();
const mockAdminId = new Types.ObjectId().toString();

const defaultConfig = {
  _id: new Types.ObjectId(),
  communityId: new Types.ObjectId(mockCommunityId),
  enabled: true,
  publicLeaderboard: true,
  scoringWeights: {
    postLikeReceived: 1,
    commentLikeReceived: 1,
    postCreated: 2,
    commentCreated: 1,
    courseCompleted: 50,
    challengeTaskApproved: 0,
    challengeCompleted: 10,
    dailyLoginStreak: 2,
    weeklyStreakBonus: 15,
  },
  dailyCaps: {
    postCreated: 5,
    commentCreated: 20,
    postLikeReceived: 50,
    commentLikeReceived: 50,
  },
  levelThresholds: [
    { level: 1, name: 'Newcomer', minPoints: 0 },
    { level: 2, name: 'Contributor', minPoints: 50 },
    { level: 3, name: 'Active Member', minPoints: 150 },
  ],
  unlockRules: [],
  save: jest.fn(),
};

const defaultProfile = {
  _id: new Types.ObjectId(),
  communityId: new Types.ObjectId(mockCommunityId),
  userId: new Types.ObjectId(mockUserId),
  totalPoints: 0,
  weeklyPoints: 0,
  level: 1,
  levelName: 'Newcomer',
  streakCurrent: 0,
  streakBest: 0,
  lastActivityDate: null,
  lastStreakDate: null,
  totalPostsCreated: 0,
  totalCommentsCreated: 0,
  totalLikesReceived: 0,
  totalCoursesCompleted: 0,
  totalChallengesCompleted: 0,
  isPublicProfile: true,
  leaderboardOptIn: true,
  dailyCapDate: '',
  dailyPostsCreated: 0,
  dailyCommentsCreated: 0,
  dailyLikesReceived: 0,
  save: jest.fn(),
};

describe('GamificationService', () => {
  let service: GamificationService;
  let configModelMock: any;
  let memberModelMock: any;
  let eventModelMock: any;
  let userModelMock: any;
  let communityModelMock: any;

  beforeEach(async () => {
    configModelMock = mockModel();
    memberModelMock = mockModel();
    eventModelMock = mockModel();
    userModelMock = mockModel();
    communityModelMock = mockModel();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GamificationService,
        {
          provide: getModelToken(CommunityGamificationConfig.name),
          useValue: configModelMock,
        },
        {
          provide: getModelToken(CommunityMemberGamification.name),
          useValue: memberModelMock,
        },
        {
          provide: getModelToken(GamificationEvent.name),
          useValue: eventModelMock,
        },
        { provide: getModelToken(User.name), useValue: userModelMock },
        {
          provide: getModelToken(Community.name),
          useValue: communityModelMock,
        },
      ],
    }).compile();

    service = module.get<GamificationService>(GamificationService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Admin Authorization ───────────────────────────────────────

  describe('adminAdjustment', () => {
    it('should create an ADMIN_ADJUSTMENT event with correct pointsDelta', async () => {
      configModelMock.findOne.mockResolvedValue({ ...defaultConfig });
      memberModelMock.findOne.mockResolvedValue({ ...defaultProfile });
      memberModelMock.findOneAndUpdate.mockResolvedValue({ ...defaultProfile });
      memberModelMock.updateOne.mockResolvedValue({});
      eventModelMock.findOne.mockResolvedValue(null); // no duplicate
      eventModelMock.create.mockResolvedValue({});

      await service.adminAdjustment(
        mockCommunityId,
        { userId: mockUserId, pointsDelta: 100, reason: 'test reward' },
        mockAdminId,
      );

      expect(eventModelMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: GamificationEventType.ADMIN_ADJUSTMENT,
          pointsDelta: 100,
          metadata: expect.objectContaining({ reason: 'test reward' }),
        }),
      );
    });

    it('should allow negative pointsDelta for admin adjustment', async () => {
      configModelMock.findOne.mockResolvedValue({ ...defaultConfig });
      memberModelMock.findOne.mockResolvedValue({ ...defaultProfile });
      memberModelMock.findOneAndUpdate.mockResolvedValue({ ...defaultProfile });
      memberModelMock.updateOne.mockResolvedValue({});
      eventModelMock.findOne.mockResolvedValue(null);
      eventModelMock.create.mockResolvedValue({});

      await service.adminAdjustment(
        mockCommunityId,
        { userId: mockUserId, pointsDelta: -50, reason: 'penalty' },
        mockAdminId,
      );

      expect(eventModelMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ pointsDelta: -50 }),
      );
    });
  });

  // ─── Daily Cap ─────────────────────────────────────────────────

  describe('daily cap enforcement', () => {
    it('should skip event when daily post cap is reached', async () => {
      configModelMock.findOne.mockResolvedValue({ ...defaultConfig });
      memberModelMock.findOne.mockResolvedValue({ ...defaultProfile });
      // atomicDailyCapCheck: reset update succeeds, but cap check returns null (cap reached)
      memberModelMock.updateOne.mockResolvedValue({ nModified: 0 });
      memberModelMock.findOneAndUpdate.mockResolvedValue(null); // cap reached → no match

      await service.recordEvent({
        eventType: GamificationEventType.POST_CREATED,
        actorUserId: mockUserId,
        communityId: mockCommunityId,
        sourceId: 'post:abc',
      });

      // Event should NOT be created since cap was reached
      expect(eventModelMock.create).not.toHaveBeenCalled();
    });

    it('should allow event when daily cap has room', async () => {
      configModelMock.findOne.mockResolvedValue({ ...defaultConfig });
      memberModelMock.findOne.mockResolvedValue({ ...defaultProfile });
      memberModelMock.updateOne.mockResolvedValue({});
      // findOneAndUpdate returns a doc → cap has room
      memberModelMock.findOneAndUpdate.mockResolvedValue({
        ...defaultProfile,
        dailyPostsCreated: 1,
      });
      eventModelMock.findOne.mockResolvedValue(null); // no existing event with same idempotency key
      eventModelMock.create.mockResolvedValue({});
      memberModelMock.updateOne.mockResolvedValue({});

      await service.recordEvent({
        eventType: GamificationEventType.POST_CREATED,
        actorUserId: mockUserId,
        communityId: mockCommunityId,
        sourceId: 'post:xyz',
      });

      expect(eventModelMock.create).toHaveBeenCalled();
    });

    it('should skip event when gamification is disabled', async () => {
      configModelMock.findOne.mockResolvedValue({
        ...defaultConfig,
        enabled: false,
      });

      await service.recordEvent({
        eventType: GamificationEventType.POST_CREATED,
        actorUserId: mockUserId,
        communityId: mockCommunityId,
        sourceId: 'post:disabled',
      });

      expect(eventModelMock.create).not.toHaveBeenCalled();
    });

    it('should handle duplicate events gracefully via 11000 unique-index error', async () => {
      configModelMock.findOne.mockResolvedValue({ ...defaultConfig });
      memberModelMock.findOne.mockResolvedValue({ ...defaultProfile });
      memberModelMock.updateOne.mockResolvedValue({});
      // atomicDailyCapCheck: cap has room
      memberModelMock.findOneAndUpdate.mockResolvedValue({ ...defaultProfile });
      // Simulate MongoDB duplicate-key error on the unique idempotencyKey index
      const dupKeyError = Object.assign(
        new Error('E11000 duplicate key error'),
        { code: 11000 },
      );
      eventModelMock.create.mockRejectedValue(dupKeyError);

      // Should resolve cleanly — the 11000 is caught and swallowed
      await expect(
        service.recordEvent({
          eventType: GamificationEventType.POST_CREATED,
          actorUserId: mockUserId,
          communityId: mockCommunityId,
          sourceId: 'post:dup',
        }),
      ).resolves.toBeUndefined();

      // create was attempted but the 11000 error caused an early return
      expect(eventModelMock.create).toHaveBeenCalledTimes(1);
      // applyPoints (the $inc updateOne) should NOT have been called
      const pointsUpdates = (
        memberModelMock.updateOne as jest.Mock
      ).mock.calls.filter(
        (call: any[]) => call[1]?.$inc?.totalPoints !== undefined,
      );
      expect(pointsUpdates).toHaveLength(0);
    });
  });

  // ─── Private Leaderboard ───────────────────────────────────────

  describe('leaderboard privacy', () => {
    it('should return empty entries when leaderboard is private', async () => {
      communityModelMock.findOne.mockResolvedValue({
        _id: new Types.ObjectId(mockCommunityId),
        slug: 'test-community',
      });
      configModelMock.findOne.mockResolvedValue({
        ...defaultConfig,
        publicLeaderboard: false,
      });
      memberModelMock.findOne.mockResolvedValue({
        ...defaultProfile,
        totalPoints: 100,
      });
      memberModelMock.countDocuments.mockResolvedValue(5);

      const result = await service.getLeaderboard(
        'test-community',
        'all_time',
        25,
        0,
        mockUserId,
      );

      expect(result.entries).toHaveLength(0);
      expect(result.isPrivate).toBe(true);
      expect(result.currentUserRank).toBeDefined();
    });

    it('should return full entries when leaderboard is public', async () => {
      // The service reads community.members + createur to build the candidate list
      const memberUserId = new Types.ObjectId();
      const createurId = new Types.ObjectId();

      communityModelMock.findOne.mockResolvedValue({
        _id: new Types.ObjectId(mockCommunityId),
        slug: 'test-community',
        members: [memberUserId],
        createur: createurId,
      });
      configModelMock.findOne.mockResolvedValue({
        ...defaultConfig,
        publicLeaderboard: true,
      });

      // Profile for the member (userId must match one of the community member ids)
      const mockProfile = {
        userId: memberUserId,
        totalPoints: 200,
        weeklyPoints: 50,
        level: 2,
        levelName: 'Contributor',
        streakCurrent: 3,
        leaderboardOptIn: true,
      };

      // memberModel.find(...).lean() — no sort/skip/limit in the public path
      memberModelMock.find = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([mockProfile]),
      });

      // userModel.find(...).select(...).lean()
      userModelMock.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest
          .fn()
          .mockResolvedValue([
            { _id: memberUserId, name: 'Test Member', profile_picture: '' },
          ]),
      });

      // findOne used for current-user rank look-up
      memberModelMock.findOne.mockResolvedValue({
        ...defaultProfile,
        totalPoints: 100,
      });

      const result = await service.getLeaderboard(
        'test-community',
        'all_time',
        25,
        0,
        mockUserId,
      );

      expect(result.isPrivate).toBeUndefined();
      expect(result.entries.length).toBeGreaterThan(0);
    });

    it('should throw ForbiddenException when viewing private profile of another user', async () => {
      communityModelMock.findOne.mockResolvedValue({
        _id: new Types.ObjectId(mockCommunityId),
        slug: 'test-community',
      });
      configModelMock.findOne.mockResolvedValue({
        ...defaultConfig,
        publicLeaderboard: false,
      });

      const otherUserId = new Types.ObjectId().toString();

      await expect(
        service.getUserProfile(otherUserId, 'test-community', mockUserId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow viewing own profile even when leaderboard is private', async () => {
      communityModelMock.findOne.mockResolvedValue({
        _id: new Types.ObjectId(mockCommunityId),
        slug: 'test-community',
      });
      configModelMock.findOne.mockResolvedValue({
        ...defaultConfig,
        publicLeaderboard: false,
      });
      memberModelMock.findOne.mockResolvedValue({ ...defaultProfile });
      memberModelMock.countDocuments.mockResolvedValue(0);

      // Same userId as requester — should not throw
      await expect(
        service.getUserProfile(mockUserId, 'test-community', mockUserId),
      ).resolves.toBeDefined();
    });
  });

  // ─── Level-up Unlock Idempotency ───────────────────────────────

  describe('level-up unlock idempotency', () => {
    it('should not duplicate unlock grants on repeated level recomputation', async () => {
      const configWithUnlock = {
        ...defaultConfig,
        unlockRules: [
          {
            level: 2,
            targetType: 'badge',
            targetId: 'badge-contributor',
            description: 'Contributor Badge',
          },
        ],
        save: jest.fn(),
      };

      configModelMock.findOne.mockResolvedValue(configWithUnlock);

      // Profile is at level 1 but has enough points for level 2
      const profileAtLevel1 = {
        ...defaultProfile,
        totalPoints: 75, // above Contributor threshold of 50
        level: 1,
        levelName: 'Newcomer',
        save: jest.fn(),
      };
      memberModelMock.findOne.mockResolvedValue(profileAtLevel1);

      // Unlock already granted (idempotency key exists)
      eventModelMock.findOne.mockResolvedValue({
        idempotencyKey: 'unlock:...',
      });
      eventModelMock.create = jest.fn();

      // Call recomputeLevel (via recomputeAllMembers indirectly)
      // We test dispatchLevelUpUnlocks through recomputeLevel by checking create was NOT called
      // Since findOne returns existing unlock, create should not be called for the unlock
      memberModelMock.find.mockResolvedValue([profileAtLevel1]);
      memberModelMock.updateOne.mockResolvedValue({});
      eventModelMock.aggregate.mockResolvedValue([{ total: 75 }]);

      await service.recomputeAllMembers(mockCommunityId);

      // The unlock event.create should not be called since idempotency check returned existing
      const unlockCreates = (
        eventModelMock.create as jest.Mock
      ).mock.calls.filter((call) => call[0]?.sourceType === 'level_unlock');
      expect(unlockCreates).toHaveLength(0);
    });

    it('should grant unlock when not previously granted', async () => {
      const configWithUnlock = {
        ...defaultConfig,
        unlockRules: [
          {
            level: 2,
            targetType: 'badge',
            targetId: 'badge-new',
            description: 'New Badge',
          },
        ],
        save: jest.fn(),
      };
      configModelMock.findOne.mockResolvedValue(configWithUnlock);

      const profileAtLevel1 = {
        ...defaultProfile,
        totalPoints: 75,
        level: 1,
        levelName: 'Newcomer',
        save: jest.fn(),
      };
      memberModelMock.findOne.mockResolvedValue(profileAtLevel1);

      // No existing unlock event
      eventModelMock.findOne.mockResolvedValue(null);
      eventModelMock.create.mockResolvedValue({});
      memberModelMock.find.mockResolvedValue([profileAtLevel1]);
      memberModelMock.updateOne.mockResolvedValue({});
      eventModelMock.aggregate.mockResolvedValue([{ total: 75 }]);

      await service.recomputeAllMembers(mockCommunityId);

      // The unlock create should have been called
      const unlockCreates = (
        eventModelMock.create as jest.Mock
      ).mock.calls.filter((call) => call[0]?.sourceType === 'level_unlock');
      expect(unlockCreates.length).toBeGreaterThanOrEqual(1);
    });
  });
});
