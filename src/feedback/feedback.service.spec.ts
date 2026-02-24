import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { FeedbackService } from './feedback.service';

const makeSelectExecQuery = (value: any) => ({
  select: jest.fn().mockReturnValue({
    exec: jest.fn().mockResolvedValue(value),
  }),
});

const makePopulateExecQuery = (value: any) => ({
  populate: jest.fn().mockReturnValue({
    exec: jest.fn().mockResolvedValue(value),
  }),
});

const makeFindChain = (value: any[]) => {
  const chain: any = {
    exec: jest.fn().mockResolvedValue(value),
  };
  chain.populate = jest.fn().mockReturnValue(chain);
  chain.sort = jest.fn().mockReturnValue(chain);
  return chain;
};

describe('FeedbackService (Session feedback)', () => {
  const userId = new Types.ObjectId().toString();
  const otherUserId = new Types.ObjectId().toString();
  const feedbackId = new Types.ObjectId().toString();
  const sessionMongoId = new Types.ObjectId().toString();
  const sessionCustomId = 'session-custom-id';

  const build = (options?: {
    sessionCreatorId?: string;
    sessionBookings?: any[];
    existingFeedback?: any | null;
  }) => {
    const feedbackModel: any = jest.fn().mockImplementation(function FeedbackModel(this: any, data: any) {
      Object.assign(this, data);
      this._id = this._id || new Types.ObjectId();
      this.save = jest.fn().mockResolvedValue(this);
    });

    feedbackModel.findOne = jest.fn().mockResolvedValue(options?.existingFeedback ?? null);
    feedbackModel.findById = jest.fn().mockImplementation(() =>
      makePopulateExecQuery({
        _id: feedbackId,
        relatedTo: sessionMongoId,
        relatedModel: 'Session',
        rating: 5,
        comment: 'Great',
        user: {
          _id: userId,
          name: 'Test User',
          photo_profil: undefined,
        },
      }),
    );
    feedbackModel.find = jest.fn().mockImplementation(() => makeFindChain([{ rating: 5 }]));
    feedbackModel.updateMany = jest.fn().mockResolvedValue({ acknowledged: true });

    const sessionDoc = {
      _id: new Types.ObjectId(sessionMongoId),
      id: sessionCustomId,
      creatorId: new Types.ObjectId(options?.sessionCreatorId || otherUserId),
      bookings: options?.sessionBookings || [
        { userId: new Types.ObjectId(userId), status: 'completed' },
      ],
    };

    const sessionAggregateDoc = {
      _id: new Types.ObjectId(sessionMongoId),
      averageRating: 0,
      ratingCount: 0,
      save: jest.fn().mockResolvedValue(undefined),
    };

    const sessionModel: any = {
      findOne: jest.fn().mockImplementation(() => makeSelectExecQuery(sessionDoc)),
      findById: jest.fn().mockImplementation((id: string) => {
        if (String(id) === sessionMongoId) {
          const queryLike: any = {
            select: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue(sessionDoc),
            }),
            then: (resolve: any, reject?: any) =>
              Promise.resolve(sessionAggregateDoc).then(resolve, reject),
            catch: (reject: any) => Promise.resolve(sessionAggregateDoc).catch(reject),
          };
          return queryLike;
        }
        const queryLike: any = {
          select: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(null),
          }),
          then: (resolve: any, reject?: any) => Promise.resolve(null).then(resolve, reject),
          catch: (reject: any) => Promise.resolve(null).catch(reject),
        };
        return queryLike;
      }),
    };

    const cacheInvalidationService = {
      invalidateFeedback: jest.fn().mockResolvedValue(undefined),
    };

    const service = new FeedbackService(
      feedbackModel,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      sessionModel,
      cacheInvalidationService as any,
    );

    return {
      service,
      feedbackModel,
      sessionModel,
      sessionAggregateDoc,
      cacheInvalidationService,
    };
  };

  it('creates session feedback from custom session id and canonicalizes to session _id', async () => {
    const { service, feedbackModel, cacheInvalidationService } = build();

    await service.create(
      {
        relatedTo: sessionCustomId,
        relatedModel: 'Session',
        rating: 5,
        comment: 'Excellent',
      },
      userId,
    );

    expect(feedbackModel.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        relatedTo: { $in: expect.arrayContaining([sessionCustomId, sessionMongoId]) },
      }),
    );
    expect(cacheInvalidationService.invalidateFeedback).toHaveBeenCalledWith('Session', sessionMongoId);
  });

  it('creates session feedback from session _id input', async () => {
    const { service, cacheInvalidationService } = build();

    jest.spyOn(service as any, 'resolveSessionFeedbackScope').mockResolvedValue({
      canonicalRelatedTo: sessionMongoId,
      relatedToCandidates: [sessionMongoId],
      session: {
        creatorId: new Types.ObjectId(otherUserId),
        bookings: [{ userId: new Types.ObjectId(userId), status: 'completed' }],
      },
    });

    await service.create(
      {
        relatedTo: sessionMongoId,
        relatedModel: 'Session',
        rating: 4,
        comment: 'Useful',
      },
      userId,
    );

    expect(cacheInvalidationService.invalidateFeedback).toHaveBeenCalledWith('Session', sessionMongoId);
  });

  it('rejects feedback when user has no completed booking', async () => {
    const { service, feedbackModel } = build({
      sessionBookings: [{ userId: new Types.ObjectId(userId), status: 'pending' }],
    });

    await expect(
      service.create(
        {
          relatedTo: sessionCustomId,
          relatedModel: 'Session',
          rating: 3,
          comment: 'Pending only',
        },
        userId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(feedbackModel.findOne).not.toHaveBeenCalled();
  });

  it('rejects creator self-review', async () => {
    const { service } = build({
      sessionCreatorId: userId,
      sessionBookings: [{ userId: new Types.ObjectId(userId), status: 'completed' }],
    });

    await expect(
      service.create(
        {
          relatedTo: sessionCustomId,
          relatedModel: 'Session',
          rating: 1,
          comment: 'self review',
        },
        userId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('resubmission updates existing feedback (no duplicate create)', async () => {
    const existingFeedback = {
      _id: new Types.ObjectId(),
      relatedTo: new Types.ObjectId(sessionMongoId),
      relatedModel: 'Session',
      rating: 2,
      comment: 'old',
      save: jest.fn().mockResolvedValue(undefined),
    };

    const { service, feedbackModel, cacheInvalidationService } = build({
      existingFeedback,
    });

    await service.create(
      {
        relatedTo: sessionCustomId,
        relatedModel: 'Session',
        rating: 5,
        comment: 'updated',
      },
      userId,
    );

    expect(existingFeedback.save).toHaveBeenCalled();
    expect(feedbackModel).not.toHaveBeenCalled();
    expect(cacheInvalidationService.invalidateFeedback).toHaveBeenCalledWith('Session', sessionMongoId);
  });

  it('findByRelated/findUserFeedback/getStats resolve legacy and canonical session identifiers', async () => {
    const { service, feedbackModel } = build();

    feedbackModel.find.mockImplementation(() => makeFindChain([]));
    feedbackModel.findOne.mockImplementation(() => makePopulateExecQuery(null));

    await service.findByRelated('Session', sessionCustomId);
    await service.findUserFeedback('Session', sessionCustomId, userId);
    await service.getStats('Session', sessionCustomId);

    const findByRelatedArgs = feedbackModel.find.mock.calls[0][0];
    const getStatsArgs = feedbackModel.find.mock.calls[1][0];
    const findUserArgs = feedbackModel.findOne.mock.calls[0][0];

    expect(findByRelatedArgs.relatedTo.$in).toEqual(
      expect.arrayContaining([sessionCustomId, sessionMongoId]),
    );
    expect(getStatsArgs.relatedTo.$in).toEqual(
      expect.arrayContaining([sessionCustomId, sessionMongoId]),
    );
    expect(findUserArgs.relatedTo.$in).toEqual(
      expect.arrayContaining([sessionCustomId, sessionMongoId]),
    );
  });

  it('update invalidates cache using canonical session _id', async () => {
    const updateFeedbackDoc = {
      _id: new Types.ObjectId(feedbackId),
      relatedTo: sessionCustomId,
      relatedModel: 'Session',
      rating: 2,
      comment: 'old',
      save: jest.fn().mockResolvedValue(undefined),
    };

    const { service, feedbackModel, cacheInvalidationService } = build();
    feedbackModel.findOne.mockResolvedValue(updateFeedbackDoc);

    await service.update(feedbackId, userId, 4, 'new');

    expect(updateFeedbackDoc.save).toHaveBeenCalled();
    expect(cacheInvalidationService.invalidateFeedback).toHaveBeenCalledWith('Session', sessionMongoId);
  });
});
