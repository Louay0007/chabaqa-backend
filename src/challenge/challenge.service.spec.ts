import { ChallengeService } from './challenge.service';
import { Types } from 'mongoose';
import { BadRequestException } from '@nestjs/common';

describe('ChallengeService', () => {
  const makeService = (overrides?: {
    challengeModel?: any;
    communityModel?: any;
    submissionModel?: any;
    uploadService?: any;
    cacheService?: any;
  }) => {
    const challengeModel = overrides?.challengeModel ?? {};
    const communityModel = overrides?.communityModel ?? {};
    const submissionModel = overrides?.submissionModel ?? {};
    const uploadService = overrides?.uploadService ?? { ensureAbsoluteUrl: (value: string) => value };
    const cacheService = overrides?.cacheService ?? { deletePattern: jest.fn().mockResolvedValue(undefined) };

    return new ChallengeService(
      challengeModel as any,
      communityModel as any,
      {} as any,
      submissionModel as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      uploadService as any,
      {} as any,
      cacheService as any,
    );
  };

  describe('normalizeTaskInput', () => {
    it('keeps explicit isActive=false and defaults missing isActive to true', () => {
      const service = makeService() as any;

      const normalized = service.normalizeTaskInput([
        {
          day: 1,
          title: 'Task one',
          description: 'Task description one',
          deliverable: 'Deliverable one',
          points: 10,
          isActive: false,
        },
        {
          day: 2,
          title: 'Task two',
          description: 'Task description two',
          deliverable: 'Deliverable two',
          points: 20,
        },
      ]);

      expect(normalized).toHaveLength(2);
      expect(normalized[0].isActive).toBe(false);
      expect(normalized[1].isActive).toBe(true);
    });
  });

  describe('getUserParticipations', () => {
    it('filters by community.id (stored challenge key) when communitySlug is provided', async () => {
      const lean = jest.fn().mockResolvedValue([]);
      const sort = jest.fn().mockReturnValue({ lean });
      const populateSecond = jest.fn().mockReturnValue({ sort });
      const populateFirst = jest.fn().mockReturnValue({ populate: populateSecond });
      const find = jest.fn().mockReturnValue({ populate: populateFirst });

      const service = makeService({
        challengeModel: { find },
        communityModel: {
          findOne: jest.fn().mockResolvedValue({ id: 'community-custom-id', _id: 'mongo-id' }),
        },
      });

      await service.getUserParticipations('507f1f77bcf86cd799439011', 'community-slug');

      expect(find).toHaveBeenCalledWith(
        expect.objectContaining({
          communityId: 'community-custom-id',
        }),
      );
    });

    it('does not add communityId to query when communitySlug is not provided', async () => {
      const lean = jest.fn().mockResolvedValue([]);
      const sort = jest.fn().mockReturnValue({ lean });
      const populateSecond = jest.fn().mockReturnValue({ sort });
      const populateFirst = jest.fn().mockReturnValue({ populate: populateSecond });
      const find = jest.fn().mockReturnValue({ populate: populateFirst });

      const service = makeService({
        challengeModel: { find },
        communityModel: {
          findOne: jest.fn(),
        },
      });

      await service.getUserParticipations('507f1f77bcf86cd799439011');

      const queryArg = find.mock.calls[0][0];
      expect(queryArg.communityId).toBeUndefined();
    });
  });

  describe('getChallengesByUser', () => {
    it('adds community fields and computes participated progress from completedTasks length', async () => {
      const userId = '507f1f77bcf86cd799439011';

      const participatedFind = {
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          {
            id: 'challenge-participated',
            title: 'Participated challenge',
            description: 'Desc',
            thumbnail: '',
            communityId: 'community-custom-id',
            category: 'Programming',
            difficulty: 'Intermediate',
            startDate: new Date('2025-01-01T00:00:00.000Z'),
            endDate: new Date('2025-01-30T00:00:00.000Z'),
            tasks: [{ id: 't1' }, { id: 't2' }, { id: 't3' }, { id: 't4' }],
            participants: [
              { userId: { toString: () => userId }, completedTasks: ['t1', 't2'], joinedAt: new Date('2025-01-10T00:00:00.000Z') },
            ],
            creatorId: { name: 'Creator', profile_picture: '' },
          },
        ]),
      };

      const createdFind = {
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          {
            id: 'challenge-created',
            title: 'Created challenge',
            description: 'Desc',
            thumbnail: '',
            communityId: 'community-custom-id',
            category: 'Design',
            difficulty: 'Beginner',
            startDate: new Date('2025-01-01T00:00:00.000Z'),
            endDate: new Date('2025-01-30T00:00:00.000Z'),
            isActive: true,
            createdAt: new Date('2025-01-11T00:00:00.000Z'),
            participants: [],
            creatorId: { name: 'Creator', profile_picture: '' },
          },
        ]),
      };

      const find = jest.fn().mockImplementation((query: any) => {
        if (query && query['participants.userId']) return participatedFind;
        return createdFind;
      });

      const service = makeService({
        challengeModel: { find },
        communityModel: {
          find: jest.fn().mockResolvedValue([
            { _id: new Types.ObjectId(), id: 'community-custom-id', name: 'Design Community', slug: 'design-community' },
          ]),
        },
      });

      const result = await service.getChallengesByUser(userId, 1, 12, 'all');
      expect(result.success).toBe(true);
      expect(result.data.challenges).toHaveLength(2);
      const participated = result.data.challenges.find((challenge: any) => challenge.id === 'challenge-participated');
      expect(participated.progress).toBe(50);
      expect(participated.communityName).toBe('Design Community');
      expect(participated.communitySlug).toBe('design-community');
      expect(participated.community?.slug).toBe('design-community');
      expect(participated.slug).toBe('design-community');
    });

    it('hides participated challenges for public scope and filters created challenges to active only', async () => {
      const userId = '507f1f77bcf86cd799439011';

      const createdFind = {
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          {
            id: 'challenge-created',
            title: 'Created challenge',
            description: 'Desc',
            thumbnail: '',
            communityId: 'community-custom-id',
            category: 'Design',
            difficulty: 'Beginner',
            isActive: true,
            createdAt: new Date('2025-01-11T00:00:00.000Z'),
            participants: [],
            creatorId: { name: 'Creator', profile_picture: '' },
          },
        ]),
      };

      const find = jest.fn().mockReturnValue(createdFind);

      const service = makeService({
        challengeModel: { find },
        communityModel: {
          find: jest.fn().mockResolvedValue([
            { _id: new Types.ObjectId(), id: 'community-custom-id', name: 'Design Community', slug: 'design-community' },
          ]),
        },
      });

      const result = await service.getChallengesByUser(userId, 1, 12, 'all', undefined, 'public');
      const createdQuery = find.mock.calls[0][0];

      expect(createdQuery['participants.userId']).toBeUndefined();
      expect(String(createdQuery.creatorId)).toBe(userId);
      expect(createdQuery.isActive).toBe(true);
      expect(result.success).toBe(true);
      expect(result.data.challenges).toHaveLength(1);
      expect(result.data.challenges[0].type).toBe('created');
    });
  });

  describe('update', () => {
    it('keeps existing tasks when patch payload does not include tasks', async () => {
      const userId = '507f1f77bcf86cd799439011';
      const challengeMongoId = '507f1f77bcf86cd799439012';

      const challengeDoc: any = {
        _id: { toString: () => challengeMongoId },
        id: 'challenge-custom-id',
        creatorId: { toString: () => userId },
        communityId: 'community-custom-id',
        title: 'Original title',
        description: 'Original description',
        tasks: [
          {
            id: 'task-1',
            day: 1,
            title: 'Task 1',
            description: 'Task description',
            deliverable: 'Deliverable',
            points: 10,
            resources: [],
          },
        ],
        save: jest.fn().mockResolvedValue(null),
      };
      challengeDoc.save.mockImplementation(async () => challengeDoc);

      const challengeModel = {
        findById: jest.fn().mockResolvedValue(challengeDoc),
        findOne: jest.fn(),
      };

      const service = makeService({
        challengeModel,
        communityModel: {
          findOne: jest.fn().mockResolvedValue({ id: 'community-custom-id', slug: 'community-slug' }),
        },
      }) as any;

      jest.spyOn(service, 'transformToResponseDto').mockResolvedValue({ id: challengeDoc.id });

      await service.update(
        challengeMongoId,
        { title: 'Updated title', tasks: undefined, steps: [] } as any,
        userId,
      );

      expect(challengeDoc.tasks).toHaveLength(1);
      expect(challengeDoc.tasks[0].id).toBe('task-1');
      expect(challengeDoc.title).toBe('Updated title');
      expect((challengeDoc as any).steps).toBeUndefined();
      expect(challengeDoc.save).toHaveBeenCalled();
    });
  });

  describe('reviewSubmission', () => {
    it('auto-awards configured task points on approval and normalizes legacy day-based task IDs', async () => {
      const challengeId = new Types.ObjectId('507f1f77bcf86cd799439012');
      const reviewerId = '507f1f77bcf86cd799439011';
      const userId = new Types.ObjectId('507f1f77bcf86cd799439013');

      const submissionDoc: any = {
        challengeId,
        taskId: '1',
        userId,
        status: 'pending',
        feedback: '',
        pointsAwarded: 0,
        save: jest.fn().mockResolvedValue(undefined),
      };

      const service = makeService({
        submissionModel: {
          findById: jest.fn().mockResolvedValue(submissionDoc),
        },
      }) as any;

      jest.spyOn(service as any, 'findChallengeById').mockResolvedValue({
        creatorId: { toString: () => reviewerId },
        tasks: [{ id: 'task-canonical-1', day: 1, points: 75 }],
      });
      jest.spyOn(service as any, 'assertCreatorOrAdmin').mockImplementation(() => undefined);
      const updateProgressSpy = jest.spyOn(service, 'updateProgress').mockResolvedValue({ id: 'challenge' } as any);

      await service.reviewSubmission(
        'submission-1',
        { status: 'approved' },
        reviewerId,
        { role: 'creator' },
      );

      expect(submissionDoc.taskId).toBe('task-canonical-1');
      expect(submissionDoc.pointsAwarded).toBe(75);
      expect(updateProgressSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          challengeId: challengeId.toString(),
          taskId: 'task-canonical-1',
          status: 'completed',
        }),
        userId.toString(),
      );
    });

    it('locks approved submissions and prevents any further review updates', async () => {
      const challengeId = new Types.ObjectId('507f1f77bcf86cd799439112');
      const reviewerId = '507f1f77bcf86cd799439111';
      const userId = new Types.ObjectId('507f1f77bcf86cd799439113');

      const submissionDoc: any = {
        challengeId,
        taskId: 'task-2',
        userId,
        status: 'approved',
        feedback: '',
        pointsAwarded: 120,
        save: jest.fn().mockResolvedValue(undefined),
      };

      const service = makeService({
        submissionModel: {
          findById: jest.fn().mockResolvedValue(submissionDoc),
        },
      }) as any;

      jest.spyOn(service as any, 'findChallengeById').mockResolvedValue({
        creatorId: { toString: () => reviewerId },
        tasks: [{ id: 'task-2', day: 2, points: 120 }],
      });
      jest.spyOn(service as any, 'assertCreatorOrAdmin').mockImplementation(() => undefined);
      const updateProgressSpy = jest.spyOn(service, 'updateProgress').mockResolvedValue({ id: 'challenge' } as any);

      await expect(
        service.reviewSubmission(
          'submission-2',
          { status: 'feedback_required', feedback: 'Please improve formatting.' },
          reviewerId,
          { role: 'creator' },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(submissionDoc.save).not.toHaveBeenCalled();
      expect(updateProgressSpy).not.toHaveBeenCalled();
    });
  });
});
