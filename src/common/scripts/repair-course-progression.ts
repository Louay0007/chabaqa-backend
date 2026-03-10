import 'dotenv/config';
import mongoose, { Types } from 'mongoose';

const AUTO_COMPLETE_THRESHOLD = 90;

type Counters = {
  processed: number;
  updated: number;
  skipped: number;
  missingCourse: number;
  orphanProgressRemoved: number;
  completionUpgraded: number;
  completionDowngraded: number;
  completedAtFixed: number;
  purchasedEntitlementsSynced: number;
};

type OrderedChapter = {
  id: string;
  isPaidChapter: boolean;
  isPreview: boolean;
  duree?: number;
};

function isObjectIdLike(value: unknown): value is string {
  return typeof value === 'string' && Types.ObjectId.isValid(value);
}

function toOrderedChapters(course: any): OrderedChapter[] {
  const sections = Array.isArray(course?.sections) ? [...course.sections] : [];
  sections.sort((a, b) => Number(a?.ordre || 0) - Number(b?.ordre || 0));

  const ordered: OrderedChapter[] = [];
  for (const section of sections) {
    const chapters = Array.isArray(section?.chapitres) ? [...section.chapitres] : [];
    chapters.sort((a, b) => Number(a?.ordre || 0) - Number(b?.ordre || 0));

    for (const chapter of chapters) {
      ordered.push({
        id: String(chapter?.id || ''),
        isPaidChapter: Boolean(chapter?.isPaidChapter),
        isPreview: Boolean(chapter?.isPreview),
        duree: Number(chapter?.duree || 0),
      });
    }
  }

  return ordered.filter((chapter) => chapter.id.length > 0);
}

function normalizeDurationSeconds(chapter: OrderedChapter, progressEntry: any): number {
  const progressDuration = Number(progressEntry?.videoDuration || 0);
  if (Number.isFinite(progressDuration) && progressDuration > 0) {
    return Math.floor(progressDuration);
  }

  const chapterDuration = Number(chapter?.duree || 0);
  if (!Number.isFinite(chapterDuration) || chapterDuration <= 0) {
    return 0;
  }

  // Canonical chapter duration is stored in minutes; keep large legacy values as seconds.
  return chapterDuration > 600
    ? Math.floor(chapterDuration)
    : Math.floor(chapterDuration * 60);
}

async function run() {
  const execute = process.argv.includes('--execute');
  const mongoUri = process.env.MONGODB_URI || process.env.DATABASE_URL || process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('Missing MongoDB connection string (MONGODB_URI / DATABASE_URL / MONGO_URI)');
  }

  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;
  if (!db) throw new Error('Mongo database is not available');

  const enrollments = db.collection('courseenrollments');
  const courses = db.collection('cours');
  const orders = db.collection('orders');

  const counters: Counters = {
    processed: 0,
    updated: 0,
    skipped: 0,
    missingCourse: 0,
    orphanProgressRemoved: 0,
    completionUpgraded: 0,
    completionDowngraded: 0,
    completedAtFixed: 0,
    purchasedEntitlementsSynced: 0,
  };

  const courseCache = new Map<string, any>();
  const paidChapterOrdersCache = new Map<string, Set<string>>();

  const cursor = enrollments.find({ isActive: true });
   
  while (true) {
    const enrollment = await cursor.next();
    if (!enrollment) break;
    counters.processed += 1;

    const enrollmentCourseId = enrollment?.courseId?.toString?.() || String(enrollment?.courseId || '');
    if (!enrollmentCourseId || !isObjectIdLike(enrollmentCourseId)) {
      counters.skipped += 1;
      continue;
    }

    let course = courseCache.get(enrollmentCourseId);
    if (!course) {
      course = await courses.findOne({ _id: new Types.ObjectId(enrollmentCourseId) });
      courseCache.set(enrollmentCourseId, course || null);
    }
    if (!course) {
      counters.missingCourse += 1;
      continue;
    }

    const orderedChapters = toOrderedChapters(course);
    const chapterMap = new Map<string, OrderedChapter>(
      orderedChapters.map((chapter) => [chapter.id, chapter]),
    );

    const progressionRows = Array.isArray(enrollment?.progression)
      ? enrollment.progression.map((row: any) => ({ ...row }))
      : [];
    const progressionMap = new Map<string, any>();
    for (const row of progressionRows) {
      const chapterId = String(row?.chapterId || '');
      if (!chapterId) continue;
      progressionMap.set(chapterId, row);
    }

    let changed = false;

    const filteredProgressionRows = progressionRows.filter((row: any) => {
      const chapterId = String(row?.chapterId || '');
      const exists = chapterMap.has(chapterId);
      if (!exists) {
        counters.orphanProgressRemoved += 1;
        changed = true;
      }
      return exists;
    });

    progressionMap.clear();
    for (const row of filteredProgressionRows) {
      progressionMap.set(String(row.chapterId), row);
    }

    const enrollmentPurchased = Array.isArray(enrollment?.purchasedChapterIds)
      ? enrollment.purchasedChapterIds.map((id: any) => String(id)).filter(Boolean)
      : [];
    const purchasedSet = new Set<string>(enrollmentPurchased);

    const buyerId = enrollment?.userId?.toString?.() || String(enrollment?.userId || '');
    if (buyerId && isObjectIdLike(buyerId)) {
      if (!paidChapterOrdersCache.has(buyerId)) {
        const paidOrders = await orders
          .find({
            buyerId: new Types.ObjectId(buyerId),
            status: 'paid',
            contentType: { $in: ['chapter'] },
          })
          .project({ contentId: 1 })
          .toArray();
        paidChapterOrdersCache.set(
          buyerId,
          new Set(
            paidOrders
              .map((row: any) => String(row?.contentId || ''))
              .filter(Boolean),
          ),
        );
      }
      const paidByOrder = paidChapterOrdersCache.get(buyerId) || new Set<string>();
      for (const chapterId of paidByOrder) {
        if (!purchasedSet.has(chapterId)) {
          purchasedSet.add(chapterId);
          changed = true;
          counters.purchasedEntitlementsSynced += 1;
        }
      }
    }

    const repairedCompletionMap = new Map<string, boolean>();
    for (let index = 0; index < orderedChapters.length; index += 1) {
      const chapter = orderedChapters[index];
      const progress = progressionMap.get(chapter.id);
      const previousChapter = index > 0 ? orderedChapters[index - 1] : null;
      const previousCompleted = previousChapter
        ? Boolean(repairedCompletionMap.get(previousChapter.id))
        : true;

      if (!progress) {
        repairedCompletionMap.set(chapter.id, false);
        continue;
      }

      const watchTime = Math.max(0, Math.floor(Number(progress?.watchTime || 0)));
      if (watchTime !== Number(progress?.watchTime || 0)) {
        progress.watchTime = watchTime;
        changed = true;
      }

      const durationSeconds = normalizeDurationSeconds(chapter, progress);
      const watchPercentage =
        durationSeconds > 0 ? (watchTime / durationSeconds) * 100 : 0;

      const requiresPurchase = chapter.isPaidChapter && !chapter.isPreview;
      const hasEntitlement = !requiresPurchase || purchasedSet.has(chapter.id);
      const shouldBeCompleted =
        watchPercentage >= AUTO_COMPLETE_THRESHOLD &&
        hasEntitlement &&
        previousCompleted;

      const wasCompleted = Boolean(progress?.isCompleted);
      if (wasCompleted !== shouldBeCompleted) {
        changed = true;
        if (shouldBeCompleted) {
          counters.completionUpgraded += 1;
        } else {
          counters.completionDowngraded += 1;
        }
      }

      progress.isCompleted = shouldBeCompleted;
      if (shouldBeCompleted) {
        if (!progress.completedAt) {
          progress.completedAt = progress.updatedAt || new Date();
          changed = true;
        }
      } else if (progress.completedAt) {
        delete progress.completedAt;
        changed = true;
      }

      repairedCompletionMap.set(chapter.id, shouldBeCompleted);
    }

    const allChaptersCompleted =
      orderedChapters.length > 0 &&
      orderedChapters.every((chapter) => {
        const progress = progressionMap.get(chapter.id);
        return Boolean(progress?.isCompleted);
      });

    const hadCompletedAt = Boolean(enrollment?.completedAt);
    const shouldHaveCompletedAt = allChaptersCompleted;
    let nextCompletedAt = enrollment?.completedAt;

    if (shouldHaveCompletedAt && !hadCompletedAt) {
      nextCompletedAt = new Date();
      changed = true;
      counters.completedAtFixed += 1;
    } else if (!shouldHaveCompletedAt && hadCompletedAt) {
      nextCompletedAt = null;
      changed = true;
      counters.completedAtFixed += 1;
    }

    const nextPurchased = Array.from(purchasedSet);
    nextPurchased.sort();
    const prevPurchasedSorted = [...enrollmentPurchased].sort();
    if (JSON.stringify(nextPurchased) !== JSON.stringify(prevPurchasedSorted)) {
      changed = true;
    }

    if (!changed) {
      counters.skipped += 1;
      continue;
    }

    counters.updated += 1;
    if (!execute) {
      continue;
    }

    const setOps: Record<string, any> = {
      progression: filteredProgressionRows,
      purchasedChapterIds: nextPurchased,
      updatedAt: new Date(),
    };
    const unsetOps: Record<string, any> = {};

    if (nextCompletedAt) {
      setOps.completedAt = nextCompletedAt;
    } else {
      unsetOps.completedAt = '';
    }

    await enrollments.updateOne(
      { _id: enrollment._id },
      {
        $set: setOps,
        ...(Object.keys(unsetOps).length > 0 ? { $unset: unsetOps } : {}),
      },
    );
  }

  console.log(
    `Course progression repair report (${execute ? 'execute' : 'dry-run'}):`,
    counters,
  );
  await mongoose.disconnect();
}

void run().catch(async (error) => {
  console.error('Course progression repair failed:', error);
  await mongoose.disconnect();
  process.exit(1);
});
