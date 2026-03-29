import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Cours,
  CoursDocument,
  CourseEnrollment,
  CourseEnrollmentDocument,
  CourseProgress,
} from '../../schema/course.schema';
import { Order, OrderDocument } from '../../schema/order.schema';
import { TrackableContentType } from '../../schema/content-tracking.schema';

export type ChapterLockCode =
  | 'allowed'
  | 'chapter_not_found'
  | 'not_enrolled_preview_only'
  | 'payment_required'
  | 'previous_chapter_incomplete';

export interface ChapterReference {
  id: string;
  titre: string;
  ordre: number;
  sectionId: string;
  sectionTitre: string;
}

export interface OrderedChapterDescriptor {
  chapter: any;
  section: any;
  index: number;
}

export interface ChapterAccessContext {
  userId: string;
  course: CoursDocument;
  enrollment: CourseEnrollmentDocument | null;
  orderedChapters: OrderedChapterDescriptor[];
  purchasedChapterIds: Set<string>;
  progressMap: Map<string, CourseProgress>;
}

export interface ChapterAccessDecision {
  canAccess: boolean;
  lockCode: ChapterLockCode;
  reason: string;
  hasCourseEnrollment: boolean;
  hasChapterPurchase: boolean;
  isPaidChapter: boolean;
  needsPayment: boolean;
  chapterPrice?: number;
  readOnlyPreview?: boolean;
  requiredChapter?: ChapterReference;
  nextChapter?: ChapterReference;
}

@Injectable()
export class ChapterAccessService {
  constructor(
    @InjectModel(Cours.name)
    private readonly coursModel: Model<CoursDocument>,
    @InjectModel(CourseEnrollment.name)
    private readonly courseEnrollmentModel: Model<CourseEnrollmentDocument>,
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
  ) {}

  async resolveCourse(courseId: string): Promise<CoursDocument> {
    let course: CoursDocument | null = null;

    if (Types.ObjectId.isValid(courseId)) {
      course = await this.coursModel.findById(courseId);
    }
    if (!course) {
      course = await this.coursModel.findOne({ id: courseId });
    }
    if (!course) {
      throw new NotFoundException('Cours non trouvé');
    }

    return course;
  }

  getOrderedChapterDescriptors(course: CoursDocument): OrderedChapterDescriptor[] {
    const orderedSections = [...(course.sections || [])].sort(
      (a: any, b: any) => Number(a?.ordre || 0) - Number(b?.ordre || 0),
    );

    const ordered: OrderedChapterDescriptor[] = [];
    for (const section of orderedSections) {
      const chapters = [...(section?.chapitres || [])].sort(
        (a: any, b: any) => Number(a?.ordre || 0) - Number(b?.ordre || 0),
      );
      for (const chapter of chapters) {
        ordered.push({
          chapter,
          section,
          index: ordered.length,
        });
      }
    }

    return ordered;
  }

  findChapterDescriptor(
    course: CoursDocument,
    chapterId: string,
  ): OrderedChapterDescriptor | undefined {
    return this.getOrderedChapterDescriptors(course).find(
      (descriptor) => String(descriptor.chapter?.id) === String(chapterId),
    );
  }

  private toChapterReference(descriptor?: OrderedChapterDescriptor): ChapterReference | undefined {
    if (!descriptor) return undefined;
    return {
      id: String(descriptor.chapter?.id || ''),
      titre: String(descriptor.chapter?.titre || ''),
      ordre: Number(descriptor.chapter?.ordre || 0),
      sectionId: String(descriptor.section?.id || ''),
      sectionTitre: String(descriptor.section?.titre || ''),
    };
  }

  private async resolveEnrollment(
    userId: string,
    course: CoursDocument,
  ): Promise<CourseEnrollmentDocument | null> {
    if (!Types.ObjectId.isValid(userId)) {
      return null;
    }

    return this.courseEnrollmentModel.findOne({
      userId: new Types.ObjectId(userId),
      courseId: course._id,
      isActive: true,
    });
  }

  private async resolvePaidChapterOrderIds(userId: string): Promise<Set<string>> {
    if (!Types.ObjectId.isValid(userId)) {
      return new Set<string>();
    }

    const rows = await this.orderModel
      .find({
        buyerId: new Types.ObjectId(userId),
        contentType: { $in: [TrackableContentType.CHAPTER, 'chapter'] },
        status: 'paid',
      })
      .select('contentId')
      .lean()
      .exec();

    return new Set(
      (rows || [])
        .map((row: any) => String(row?.contentId || ''))
        .filter(Boolean),
    );
  }

  private async maybeBackfillEnrollmentEntitlements(
    enrollment: CourseEnrollmentDocument | null,
    paidChapterOrderIds: Set<string>,
  ): Promise<Set<string>> {
    const purchased = new Set(
      (Array.isArray(enrollment?.purchasedChapterIds)
        ? enrollment?.purchasedChapterIds
        : []
      )
        .map((value) => String(value))
        .filter(Boolean),
    );

    let changed = false;
    for (const chapterId of paidChapterOrderIds) {
      if (!purchased.has(chapterId)) {
        purchased.add(chapterId);
        changed = true;
      }
    }

    if (changed && enrollment) {
      enrollment.purchasedChapterIds = Array.from(purchased);
      await enrollment.save();
    }

    return purchased;
  }

  async buildAccessContext(
    userId: string,
    courseIdOrDocument: string | CoursDocument,
  ): Promise<ChapterAccessContext> {
    const course =
      typeof courseIdOrDocument === 'string'
        ? await this.resolveCourse(courseIdOrDocument)
        : courseIdOrDocument;

    const enrollment = await this.resolveEnrollment(userId, course);
    const paidChapterOrderIds = await this.resolvePaidChapterOrderIds(userId);
    const purchasedChapterIds = await this.maybeBackfillEnrollmentEntitlements(
      enrollment,
      paidChapterOrderIds,
    );

    const orderedChapters = this.getOrderedChapterDescriptors(course);
    const progressMap = new Map<string, CourseProgress>();
    for (const progress of enrollment?.progression || []) {
      if (!progress?.chapterId) continue;
      progressMap.set(String(progress.chapterId), progress);
    }

    return {
      userId,
      course,
      enrollment,
      orderedChapters,
      purchasedChapterIds,
      progressMap,
    };
  }

  evaluateChapterAccess(
    context: ChapterAccessContext,
    chapterId: string,
  ): ChapterAccessDecision {
    const descriptor = context.orderedChapters.find(
      (item) => String(item.chapter?.id) === String(chapterId),
    );
    if (!descriptor) {
      return {
        canAccess: false,
        lockCode: 'chapter_not_found',
        reason: 'Chapitre non trouvé',
        hasCourseEnrollment: Boolean(context.enrollment),
        hasChapterPurchase: false,
        isPaidChapter: false,
        needsPayment: false,
      };
    }

    const nextDescriptor = context.orderedChapters[descriptor.index + 1];
    const isPaidChapter =
      Boolean(descriptor.chapter?.isPaidChapter) &&
      !descriptor.chapter?.isPreview;
    const chapterPrice = Number(descriptor.chapter?.prix || 0);
    const hasEnrollment = Boolean(context.enrollment);
    const hasChapterPurchase = isPaidChapter
      ? context.purchasedChapterIds.has(String(descriptor.chapter?.id))
      : false;

    const isPreviewChapter = Boolean(descriptor.chapter?.isPreview);

    if (!hasEnrollment) {
      // Preview policy: first chapter or any chapter explicitly marked as preview.
      if (descriptor.index === 0 || isPreviewChapter) {
        return {
          canAccess: true,
          lockCode: 'allowed',
          reason: isPreviewChapter ? 'chapter_preview' : 'first_chapter_preview',
          hasCourseEnrollment: false,
          hasChapterPurchase: false,
          isPaidChapter,
          needsPayment: false,
          chapterPrice: chapterPrice > 0 ? chapterPrice : undefined,
          readOnlyPreview: true,
          nextChapter: this.toChapterReference(nextDescriptor),
        };
      }

      return {
        canAccess: false,
        lockCode: 'not_enrolled_preview_only',
        reason: 'Only preview chapters are available before enrollment.',
        hasCourseEnrollment: false,
        hasChapterPurchase: false,
        isPaidChapter,
        needsPayment: isPaidChapter,
        chapterPrice: chapterPrice > 0 ? chapterPrice : undefined,
        nextChapter: this.toChapterReference(nextDescriptor),
      };
    }

    if (isPaidChapter && !hasChapterPurchase) {
      return {
        canAccess: false,
        lockCode: 'payment_required',
        reason: 'Paiement requis pour ce chapitre',
        hasCourseEnrollment: true,
        hasChapterPurchase: false,
        isPaidChapter: true,
        needsPayment: true,
        chapterPrice: chapterPrice > 0 ? chapterPrice : undefined,
        nextChapter: this.toChapterReference(nextDescriptor),
      };
    }

    // Sequential policy: chapter N requires chapter N-1 completed.
    // Sequential locks apply strictly to all chapters if the user is enrolled.
    if (descriptor.index > 0) {
      const previous = context.orderedChapters[descriptor.index - 1];
      const previousProgress = context.progressMap.get(String(previous.chapter?.id));
      if (!previousProgress?.isCompleted) {
        return {
          canAccess: false,
          lockCode: 'previous_chapter_incomplete',
          reason: 'Vous devez terminer le chapitre précédent pour débloquer ce contenu.',
          hasCourseEnrollment: true,
          hasChapterPurchase: hasChapterPurchase || !isPaidChapter,
          isPaidChapter,
          needsPayment: false,
          chapterPrice: chapterPrice > 0 ? chapterPrice : undefined,
          requiredChapter: this.toChapterReference(previous),
          nextChapter: this.toChapterReference(nextDescriptor),
        };
      }
    }

    return {
      canAccess: true,
      lockCode: 'allowed',
      reason: 'access_granted',
      hasCourseEnrollment: true,
      hasChapterPurchase: hasChapterPurchase || !isPaidChapter,
      isPaidChapter,
      needsPayment: false,
      chapterPrice: chapterPrice > 0 ? chapterPrice : undefined,
      nextChapter: this.toChapterReference(nextDescriptor),
    };
  }

  /**
   * Compute access decisions for ALL chapters in one call.
   * Returns an ordered list matching `orderedChapters` with full access metadata.
   */
  computeAllChapterAccess(
    context: ChapterAccessContext,
  ): Array<{
    chapterId: string;
    chapterTitle: string;
    sectionId: string;
    sectionTitle: string;
    index: number;
    isPreview: boolean;
    isPaidChapter: boolean;
    isCompleted: boolean;
    watchTime: number;
    videoDuration: number;
    access: ChapterAccessDecision;
  }> {
    return context.orderedChapters.map((descriptor) => {
      const chapterId = String(descriptor.chapter?.id || '');
      const progress = context.progressMap.get(chapterId);
      return {
        chapterId,
        chapterTitle: String(descriptor.chapter?.titre || ''),
        sectionId: String(descriptor.section?.id || ''),
        sectionTitle: String(descriptor.section?.titre || ''),
        index: descriptor.index,
        isPreview: Boolean(descriptor.chapter?.isPreview),
        isPaidChapter:
          Boolean(descriptor.chapter?.isPaidChapter) &&
          !descriptor.chapter?.isPreview,
        isCompleted: Boolean(progress?.isCompleted),
        watchTime: Number(progress?.watchTime || 0),
        videoDuration: Number((progress as any)?.videoDuration || 0),
        access: this.evaluateChapterAccess(context, chapterId),
      };
    });
  }

  /**
   * Deterministic next-chapter resolution.
   * Given the current chapter, returns exactly what should happen when the user
   * clicks "Next Chapter":
   *   - { action: 'navigate', chapterId, ... }: safe to transition
   *   - { action: 'blocked', reason, lockCode, ... }: must show CTA
   *   - { action: 'course_complete' }: no more chapters
   */
  resolveNextChapterAction(
    context: ChapterAccessContext,
    currentChapterId: string,
  ): {
    action: 'navigate' | 'blocked' | 'course_complete';
    chapterId?: string;
    chapterTitle?: string;
    sectionId?: string;
    lockCode?: ChapterLockCode;
    reason?: string;
    needsPayment?: boolean;
    chapterPrice?: number;
    requiredChapter?: ChapterReference;
  } {
    const currentIndex = context.orderedChapters.findIndex(
      (d) => String(d.chapter?.id) === String(currentChapterId),
    );
    if (currentIndex === -1 || currentIndex >= context.orderedChapters.length - 1) {
      return { action: 'course_complete' };
    }

    const nextDescriptor = context.orderedChapters[currentIndex + 1];
    const nextChapterId = String(nextDescriptor.chapter?.id || '');
    const decision = this.evaluateChapterAccess(context, nextChapterId);

    if (decision.canAccess) {
      return {
        action: 'navigate',
        chapterId: nextChapterId,
        chapterTitle: String(nextDescriptor.chapter?.titre || ''),
        sectionId: String(nextDescriptor.section?.id || ''),
      };
    }

    return {
      action: 'blocked',
      chapterId: nextChapterId,
      chapterTitle: String(nextDescriptor.chapter?.titre || ''),
      sectionId: String(nextDescriptor.section?.id || ''),
      lockCode: decision.lockCode,
      reason: decision.reason,
      needsPayment: decision.needsPayment,
      chapterPrice: decision.chapterPrice,
      requiredChapter: decision.requiredChapter,
    };
  }
}
