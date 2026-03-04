import { ChapterAccessService } from './chapter-access.service';

const makeOrderQuery = (rows: any[]) => ({
  select: jest.fn().mockReturnThis(),
  lean: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue(rows),
});

describe('ChapterAccessService', () => {
  const baseCourse: any = {
    _id: '65f0f0f0f0f0f0f0f0f0f001',
    id: 'course-public-id',
    sections: [
      {
        id: 'section-1',
        titre: 'Section 1',
        ordre: 1,
        chapitres: [
          {
            id: 'chapter-1',
            titre: 'Chapter 1',
            ordre: 1,
            isPreview: true,
            isPaidChapter: false,
            prix: 0,
          },
          {
            id: 'chapter-2',
            titre: 'Chapter 2',
            ordre: 2,
            isPreview: false,
            isPaidChapter: true,
            prix: 20,
          },
        ],
      },
    ],
  };

  const buildService = (params?: {
    enrollment?: any;
    paidOrders?: any[];
  }) => {
    const enrollment = params?.enrollment ?? null;
    const paidOrders = params?.paidOrders ?? [];

    const coursModel: any = {
      findById: jest.fn().mockResolvedValue(baseCourse),
      findOne: jest.fn().mockResolvedValue(baseCourse),
    };
    const enrollmentModel: any = {
      findOne: jest.fn().mockResolvedValue(enrollment),
    };
    const orderModel: any = {
      find: jest.fn().mockReturnValue(makeOrderQuery(paidOrders)),
    };

    const service = new ChapterAccessService(
      coursModel,
      enrollmentModel,
      orderModel,
    );

    return { service, enrollmentModel, orderModel };
  };

  it('allows first chapter as preview for non-enrolled users', async () => {
    const { service } = buildService({ enrollment: null });
    const context = await service.buildAccessContext(
      '65f0f0f0f0f0f0f0f0f0f111',
      baseCourse,
    );

    const decision = service.evaluateChapterAccess(context, 'chapter-1');
    expect(decision.canAccess).toBe(true);
    expect(decision.lockCode).toBe('allowed');
    expect(decision.readOnlyPreview).toBe(true);
    expect(decision.hasCourseEnrollment).toBe(false);
  });

  it('denies non-first chapter for non-enrolled users', async () => {
    const { service } = buildService({ enrollment: null });
    const context = await service.buildAccessContext(
      '65f0f0f0f0f0f0f0f0f0f112',
      baseCourse,
    );

    const decision = service.evaluateChapterAccess(context, 'chapter-2');
    expect(decision.canAccess).toBe(false);
    expect(decision.lockCode).toBe('not_enrolled_preview_only');
  });

  it('denies paid chapter when user is enrolled but chapter is not purchased', async () => {
    const enrollment = {
      progression: [{ chapterId: 'chapter-1', isCompleted: true }],
      purchasedChapterIds: [],
      save: jest.fn().mockResolvedValue(undefined),
    };
    const { service } = buildService({ enrollment, paidOrders: [] });
    const context = await service.buildAccessContext(
      '65f0f0f0f0f0f0f0f0f0f113',
      baseCourse,
    );

    const decision = service.evaluateChapterAccess(context, 'chapter-2');
    expect(decision.canAccess).toBe(false);
    expect(decision.lockCode).toBe('payment_required');
  });

  it('denies chapter when previous chapter is not completed', async () => {
    const course: any = {
      ...baseCourse,
      sections: [
        {
          ...baseCourse.sections[0],
          chapitres: [
            { ...baseCourse.sections[0].chapitres[0], isPaidChapter: false },
            { ...baseCourse.sections[0].chapitres[1], isPaidChapter: false },
          ],
        },
      ],
    };
    const enrollment = {
      progression: [{ chapterId: 'chapter-1', isCompleted: false }],
      purchasedChapterIds: [],
      save: jest.fn().mockResolvedValue(undefined),
    };
    const { service } = buildService({ enrollment, paidOrders: [] });
    const context = await service.buildAccessContext(
      '65f0f0f0f0f0f0f0f0f0f114',
      course,
    );

    const decision = service.evaluateChapterAccess(context, 'chapter-2');
    expect(decision.canAccess).toBe(false);
    expect(decision.lockCode).toBe('previous_chapter_incomplete');
  });

  it('allows access when chapter is purchased and previous chapter completed', async () => {
    const enrollment = {
      progression: [{ chapterId: 'chapter-1', isCompleted: true }],
      purchasedChapterIds: ['chapter-2'],
      save: jest.fn().mockResolvedValue(undefined),
    };
    const { service } = buildService({ enrollment, paidOrders: [] });
    const context = await service.buildAccessContext(
      '65f0f0f0f0f0f0f0f0f0f115',
      baseCourse,
    );

    const decision = service.evaluateChapterAccess(context, 'chapter-2');
    expect(decision.canAccess).toBe(true);
    expect(decision.lockCode).toBe('allowed');
  });
});
