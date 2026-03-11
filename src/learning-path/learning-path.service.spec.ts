import { LearningPathService } from './learning-path.service';
import { LearningPathAiService } from './learning-path-ai.service';

const makeModel = () => ({
  findOne: jest.fn(),
  updateOne: jest.fn(),
  find: jest.fn(),
});

const makeService = (overrides?: {
  aiService?: Partial<LearningPathAiService>;
  recommendationModel?: any;
  courseEnrollmentModel?: any;
  courseModel?: any;
  challengeModel?: any;
  resourceModel?: any;
}) => {
  const recommendationModel = overrides?.recommendationModel ?? makeModel();
  const courseEnrollmentModel = overrides?.courseEnrollmentModel ?? makeModel();
  const courseModel = overrides?.courseModel ?? makeModel();
  const challengeModel =
    overrides?.challengeModel ??
    ({
      find: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    } as any);
  const resourceModel = overrides?.resourceModel ?? makeModel();

  const aiService = {
    rerank: jest.fn().mockResolvedValue(null),
    ...(overrides?.aiService ?? {}),
  } as any;

  const service = new LearningPathService(
    aiService,
    recommendationModel as any,
    courseEnrollmentModel as any,
    courseModel as any,
    challengeModel as any,
    resourceModel as any,
  );

  return {
    service,
    aiService,
    recommendationModel,
    courseEnrollmentModel,
    courseModel,
    challengeModel,
    resourceModel,
  };
};

describe('LearningPathService', () => {
  it('returns cached recommendations without recomputing', async () => {
    const cached = {
      items: [
        { id: 'chapter:c1:ch1', type: 'chapter', contentId: 'ch1', title: 'Cached', reason: 'cached', score: 50 },
      ],
    };

    const { service, recommendationModel, courseEnrollmentModel, aiService } = makeService({
      recommendationModel: {
        findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(cached) }),
        updateOne: jest.fn(),
      },
      courseEnrollmentModel: {
        find: jest.fn(),
      },
    });

    const result = await service.getRecommendations('507f1f77bcf86cd799439011', {
      goals: 'learn marketing',
      limit: 5,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe('Cached');
    expect(courseEnrollmentModel.find).not.toHaveBeenCalled();
    expect(aiService.rerank).not.toHaveBeenCalled();
  });

  it('returns empty list when no candidates are found', async () => {
    const { service, recommendationModel, courseEnrollmentModel, courseModel, challengeModel, resourceModel } = makeService({
      recommendationModel: {
        findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
        updateOne: jest.fn(),
      },
      courseEnrollmentModel: {
        find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      },
      courseModel: {
        find: jest.fn().mockResolvedValue([]),
      },
      challengeModel: {
        find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      },
      resourceModel: {
        find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) }),
      },
    });

    const result = await service.getRecommendations('507f1f77bcf86cd799439011', {
      goals: 'learn',
    });

    expect(result.items).toEqual([]);
    expect(recommendationModel.updateOne).not.toHaveBeenCalled();
  });

  it('honors sequential progression and paid chapter access rules', async () => {
    const enrollment = {
      userId: '507f1f77bcf86cd799439011',
      courseId: '65a0c0f0c0f0c0f0c0f0c0f1',
      isActive: true,
      progression: [
        { chapterId: 'ch1', isCompleted: true },
      ],
      purchasedChapterIds: [],
    };

    const course = {
      _id: '65a0c0f0c0f0c0f0c0f0c0f1',
      id: 'course-1',
      titre: 'Course 1',
      description: 'desc',
      communityId: '65a0c0f0c0f0c0f0c0f0c0aa',
      isPaidCourse: false,
      sequentialProgression: true,
      sections: [
        {
          id: 's1',
          ordre: 1,
          chapitres: [
            { id: 'ch1', ordre: 1, titre: 'Intro', isPaidChapter: false },
            { id: 'ch2', ordre: 2, titre: 'Paid Chapter', isPaidChapter: true, isPreview: false },
            { id: 'ch3', ordre: 3, titre: 'Preview Chapter', isPaidChapter: true, isPreview: true },
          ],
        },
      ],
      verifierAccesChapitre: jest.fn().mockImplementation((chapterId: string) => {
        if (chapterId === 'ch2' || chapterId === 'ch3') {
          return { hasAccess: true, reason: 'previous_completed' };
        }
        return { hasAccess: true, reason: 'first_chapter' };
      }),
    };

    const { service } = makeService({
      recommendationModel: {
        findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
        updateOne: jest.fn(),
      },
      courseEnrollmentModel: {
        find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([enrollment]) }),
      },
      courseModel: {
        find: jest.fn().mockResolvedValue([course]),
      },
      challengeModel: { find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) },
      resourceModel: {
        find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) }),
      },
    });

    const result = await service.getRecommendations('507f1f77bcf86cd799439011', {
      goals: 'learn',
      limit: 5,
    });

    // ch2 is paid and not preview/purchased, should skip to ch3 (preview)
    expect(result.items[0].contentId).toBe('ch3');
  });

  it('filters by communityId when provided', async () => {
    const enrollment = {
      userId: '507f1f77bcf86cd799439011',
      courseId: '65a0c0f0c0f0c0f0c0f0c0f2',
      isActive: true,
      progression: [],
      purchasedChapterIds: [],
    };

    const course = {
      _id: '65a0c0f0c0f0c0f0c0f0c0f2',
      id: 'course-2',
      titre: 'Course 2',
      description: 'desc',
      communityId: 'community-keep',
      isPaidCourse: false,
      sequentialProgression: false,
      sections: [
        { id: 's1', ordre: 1, chapitres: [{ id: 'ch1', ordre: 1, titre: 'Intro', isPaidChapter: false }] },
      ],
      verifierAccesChapitre: jest.fn().mockReturnValue({ hasAccess: true, reason: 'first_chapter' }),
    };

    const otherCourse = {
      _id: '65a0c0f0c0f0c0f0c0f0c0f3',
      id: 'course-3',
      titre: 'Course 3',
      description: 'desc',
      communityId: 'community-skip',
      isPaidCourse: false,
      sequentialProgression: false,
      sections: [
        { id: 's1', ordre: 1, chapitres: [{ id: 'ch1x', ordre: 1, titre: 'Intro', isPaidChapter: false }] },
      ],
      verifierAccesChapitre: jest.fn().mockReturnValue({ hasAccess: true, reason: 'first_chapter' }),
    };

    const { service, courseModel } = makeService({
      recommendationModel: {
        findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
        updateOne: jest.fn(),
      },
      courseEnrollmentModel: {
        find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([enrollment]) }),
      },
      courseModel: {
        find: jest.fn().mockResolvedValue([course, otherCourse]),
      },
      challengeModel: { find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) },
      resourceModel: {
        find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) }),
      },
    });

    const result = await service.getRecommendations('507f1f77bcf86cd799439011', {
      goals: 'learn',
      communityId: 'community-keep',
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].metadata?.communityId).toBe('community-keep');
    expect(courseModel.find).toHaveBeenCalled();
  });

  it('uses AI ranking and merges reasons when available', async () => {
    const enrollment = {
      userId: '507f1f77bcf86cd799439011',
      courseId: '65a0c0f0c0f0c0f0c0f0c0f4',
      isActive: true,
      progression: [],
      purchasedChapterIds: [],
    };

    const course = {
      _id: '65a0c0f0c0f0c0f0c0f0c0f4',
      id: 'course-4',
      titre: 'Course 4',
      description: 'desc',
      communityId: 'community-1',
      isPaidCourse: false,
      sequentialProgression: false,
      sections: [
        { id: 's1', ordre: 1, chapitres: [{ id: 'ch1', ordre: 1, titre: 'Intro', isPaidChapter: false }] },
      ],
      verifierAccesChapitre: jest.fn().mockReturnValue({ hasAccess: true, reason: 'first_chapter' }),
    };

    const { service, aiService } = makeService({
      aiService: {
        rerank: jest.fn().mockResolvedValue([
          { id: 'chapter:course-4:ch1', rank: 1, reason: 'Best next step' },
        ]),
      },
      recommendationModel: {
        findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
        updateOne: jest.fn().mockResolvedValue(undefined),
      },
      courseEnrollmentModel: {
        find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([enrollment]) }),
      },
      courseModel: {
        find: jest.fn().mockResolvedValue([course]),
      },
      challengeModel: { find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) },
      resourceModel: {
        find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) }),
      },
    });

    const result = await service.getRecommendations('507f1f77bcf86cd799439011', {
      goals: 'learn',
    });

    expect(aiService.rerank).toHaveBeenCalled();
    expect(result.items[0].reason).toBe('Best next step');
  });

  it('falls back to heuristic ranking when AI returns null', async () => {
    const enrollment = {
      userId: '507f1f77bcf86cd799439011',
      courseId: '65a0c0f0c0f0c0f0c0f0c0f5',
      isActive: true,
      progression: [],
      purchasedChapterIds: [],
    };

    const course = {
      _id: '65a0c0f0c0f0c0f0c0f0c0f5',
      id: 'course-5',
      titre: 'Course 5',
      description: 'desc',
      communityId: 'community-1',
      isPaidCourse: false,
      sequentialProgression: false,
      sections: [
        { id: 's1', ordre: 1, chapitres: [{ id: 'ch1', ordre: 1, titre: 'Intro', isPaidChapter: false }] },
      ],
      verifierAccesChapitre: jest.fn().mockReturnValue({ hasAccess: true, reason: 'first_chapter' }),
    };

    const { service, aiService } = makeService({
      aiService: { rerank: jest.fn().mockResolvedValue(null) },
      recommendationModel: {
        findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
        updateOne: jest.fn().mockResolvedValue(undefined),
      },
      courseEnrollmentModel: {
        find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([enrollment]) }),
      },
      courseModel: {
        find: jest.fn().mockResolvedValue([course]),
      },
      challengeModel: { find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) },
      resourceModel: {
        find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) }),
      },
    });

    const result = await service.getRecommendations('507f1f77bcf86cd799439011', {
      goals: 'learn',
    });

    expect(aiService.rerank).toHaveBeenCalled();
    expect(result.items[0].type).toBe('chapter');
  });
});
