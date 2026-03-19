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

  // ── Preview chapter bypass (bug fix) ─────────────────────────────────────

  it('allows preview chapter at index > 0 for unenrolled users', async () => {
    const courseWithPreview: any = {
      ...baseCourse,
      sections: [
        {
          ...baseCourse.sections[0],
          chapitres: [
            { id: 'chapter-1', titre: 'Ch1', ordre: 1, isPreview: false, isPaidChapter: false, prix: 0 },
            { id: 'chapter-2', titre: 'Ch2', ordre: 2, isPreview: true, isPaidChapter: false, prix: 0 },
          ],
        },
      ],
    };
    const { service } = buildService({ enrollment: null });
    const context = await service.buildAccessContext('65f0f0f0f0f0f0f0f0f0f120', courseWithPreview);
    const decision = service.evaluateChapterAccess(context, 'chapter-2');
    expect(decision.canAccess).toBe(true);
    expect(decision.readOnlyPreview).toBe(true);
  });

  it('blocks preview chapter for enrolled user without prior chapter completion (strict sequential)', async () => {
    const courseWithPreview: any = {
      ...baseCourse,
      sections: [
        {
          ...baseCourse.sections[0],
          chapitres: [
            { id: 'chapter-1', titre: 'Ch1', ordre: 1, isPreview: false, isPaidChapter: false, prix: 0 },
            { id: 'chapter-2', titre: 'Ch2', ordre: 2, isPreview: true, isPaidChapter: false, prix: 0 },
            { id: 'chapter-3', titre: 'Ch3', ordre: 3, isPreview: false, isPaidChapter: false, prix: 0 },
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
    const context = await service.buildAccessContext('65f0f0f0f0f0f0f0f0f0f121', courseWithPreview);

    // sequential mode strictly applies even to preview chapters for enrolled users
    const decision = service.evaluateChapterAccess(context, 'chapter-2');
    expect(decision.canAccess).toBe(false);
    expect(decision.lockCode).toBe('previous_chapter_incomplete');

    // chapter-3 is NOT preview => should still be blocked
    const decision3 = service.evaluateChapterAccess(context, 'chapter-3');
    expect(decision3.canAccess).toBe(false);
    expect(decision3.lockCode).toBe('previous_chapter_incomplete');
  });

  // ── computeAllChapterAccess ──────────────────────────────────────────────

  it('computeAllChapterAccess returns consistent results', async () => {
    const enrollment = {
      progression: [{ chapterId: 'chapter-1', isCompleted: true, watchTime: 300 }],
      purchasedChapterIds: ['chapter-2'],
      save: jest.fn().mockResolvedValue(undefined),
    };
    const { service } = buildService({ enrollment, paidOrders: [] });
    const context = await service.buildAccessContext('65f0f0f0f0f0f0f0f0f0f122', baseCourse);

    const all = service.computeAllChapterAccess(context);
    expect(all).toHaveLength(2);
    expect(all[0].chapterId).toBe('chapter-1');
    expect(all[0].access.canAccess).toBe(true);
    expect(all[1].chapterId).toBe('chapter-2');
    expect(all[1].access.canAccess).toBe(true);

    // Verify each is consistent with individual call
    for (const entry of all) {
      const individual = service.evaluateChapterAccess(context, entry.chapterId);
      expect(entry.access.lockCode).toBe(individual.lockCode);
    }
  });

  // ── resolveNextChapterAction ─────────────────────────────────────────────

  it('resolveNextChapterAction returns navigate when next is accessible', async () => {
    const enrollment = {
      progression: [{ chapterId: 'chapter-1', isCompleted: true }],
      purchasedChapterIds: ['chapter-2'],
      save: jest.fn().mockResolvedValue(undefined),
    };
    const { service } = buildService({ enrollment, paidOrders: [] });
    const context = await service.buildAccessContext('65f0f0f0f0f0f0f0f0f0f123', baseCourse);

    const action = service.resolveNextChapterAction(context, 'chapter-1');
    expect(action.action).toBe('navigate');
    expect(action.chapterId).toBe('chapter-2');
  });

  it('resolveNextChapterAction returns blocked when next chapter is locked', async () => {
    const enrollment = {
      progression: [{ chapterId: 'chapter-1', isCompleted: false }],
      purchasedChapterIds: [],
      save: jest.fn().mockResolvedValue(undefined),
    };
    const courseNoPaid: any = {
      ...baseCourse,
      sections: [{
        ...baseCourse.sections[0],
        chapitres: [
          { ...baseCourse.sections[0].chapitres[0] },
          { ...baseCourse.sections[0].chapitres[1], isPaidChapter: false },
        ],
      }],
    };
    const { service } = buildService({ enrollment, paidOrders: [] });
    const context = await service.buildAccessContext('65f0f0f0f0f0f0f0f0f0f124', courseNoPaid);

    const action = service.resolveNextChapterAction(context, 'chapter-1');
    expect(action.action).toBe('blocked');
    expect(action.lockCode).toBe('previous_chapter_incomplete');
  });

  it('resolveNextChapterAction returns course_complete for last chapter', async () => {
    const enrollment = {
      progression: [],
      purchasedChapterIds: [],
      save: jest.fn().mockResolvedValue(undefined),
    };
    const { service } = buildService({ enrollment, paidOrders: [] });
    const context = await service.buildAccessContext('65f0f0f0f0f0f0f0f0f0f125', baseCourse);

    const action = service.resolveNextChapterAction(context, 'chapter-2');
    expect(action.action).toBe('course_complete');
  });

  // ── REGRESSION: exact reported bug scenario ──────────────────────────────

  it('REGRESSION: completed current chapter + preview next chapter => navigate', async () => {
    const course: any = {
      ...baseCourse,
      sections: [{
        ...baseCourse.sections[0],
        chapitres: [
          { id: 'chapter-1', titre: 'Ch1', ordre: 1, isPreview: false, isPaidChapter: false, prix: 0 },
          { id: 'chapter-2', titre: 'Ch2 (Preview)', ordre: 2, isPreview: true, isPaidChapter: false, prix: 0 },
          { id: 'chapter-3', titre: 'Ch3', ordre: 3, isPreview: false, isPaidChapter: false, prix: 0 },
        ],
      }],
    };
    const enrollment = {
      progression: [{ chapterId: 'chapter-1', isCompleted: true, watchTime: 540 }],
      purchasedChapterIds: [],
      save: jest.fn().mockResolvedValue(undefined),
    };
    const { service } = buildService({ enrollment, paidOrders: [] });
    const context = await service.buildAccessContext('65f0f0f0f0f0f0f0f0f0f126', course);

    // ch-2 access should be allowed (since ch-1 is complete, strict sequential passes)
    const ch2Decision = service.evaluateChapterAccess(context, 'chapter-2');
    expect(ch2Decision.canAccess).toBe(true);

    // resolveNextChapterAction from ch-1 should return navigate to ch-2
    const action = service.resolveNextChapterAction(context, 'chapter-1');
    expect(action.action).toBe('navigate');
    expect(action.chapterId).toBe('chapter-2');
  });
});
