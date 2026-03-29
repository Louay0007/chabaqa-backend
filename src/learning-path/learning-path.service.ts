import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash } from 'crypto';
import { LearningPathRequestDto } from './dto/learning-path-request.dto';
import { LearningPathAiService, LearningPathAiCandidate } from './learning-path-ai.service';
import {
  LearningPathRecommendation,
  LearningPathRecommendationDocument,
} from '../schema/learning-path-recommendation.schema';
import { Cours, CoursDocument, CourseEnrollmentDocument } from '../schema/course.schema';
import { Challenge, ChallengeDocument } from '../schema/challenge.schema';
import { Resource, ResourceDocument } from '../schema/resource.schema';

const MAX_CANDIDATES = 30;

export type LearningPathItem = {
  id: string;
  type: 'chapter' | 'challenge' | 'resource';
  contentId: string;
  title: string;
  reason: string;
  score: number;
  metadata?: Record<string, any>;
};

@Injectable()
export class LearningPathService {
  constructor(
    private readonly aiService: LearningPathAiService,
    @InjectModel(LearningPathRecommendation.name)
    private readonly recommendationModel: Model<LearningPathRecommendationDocument>,
    @InjectModel('CourseEnrollment')
    private readonly courseEnrollmentModel: Model<CourseEnrollmentDocument>,
    @InjectModel(Cours.name) private readonly courseModel: Model<CoursDocument>,
    @InjectModel(Challenge.name)
    private readonly challengeModel: Model<ChallengeDocument>,
    @InjectModel(Resource.name)
    private readonly resourceModel: Model<ResourceDocument>,
  ) {}

  async getRecommendations(userId: string, input: LearningPathRequestDto) {
    const normalizedGoals = String(input.goals || '').trim();
    const limit = Math.min(Math.max(Number(input.limit || 10), 1), 50);
    const communityId = input.communityId ? String(input.communityId).trim() : undefined;

    const goalsHash = this.hashGoals(normalizedGoals, communityId);
    const cached = await this.recommendationModel
      .findOne({
        userId: new Types.ObjectId(userId),
        goalsHash,
        communityId: communityId || undefined,
      })
      .lean();

    if (cached?.items?.length) {
      return { items: cached.items.slice(0, limit) };
    }

    const candidates = await this.buildCandidates(userId, communityId);
    if (candidates.length === 0) {
      return { items: [] };
    }

    const scored = candidates
      .map((candidate) => ({
        ...candidate,
        score: this.scoreCandidate(candidate, normalizedGoals),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_CANDIDATES);

    const aiCandidates: LearningPathAiCandidate[] = scored.map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      description: item.metadata?.description,
      communityId: item.metadata?.communityId,
      score: item.score,
    }));

    const aiRanked = await this.aiService.rerank(normalizedGoals, aiCandidates, limit);
    const finalItems = this.mergeRanking(scored, aiRanked, limit);

    await this.recommendationModel.updateOne(
      {
        userId: new Types.ObjectId(userId),
        goalsHash,
        communityId: communityId || undefined,
      },
      {
        $set: {
          items: finalItems,
          generatedAt: new Date(),
        },
      },
      { upsert: true },
    );

    return { items: finalItems };
  }

  private hashGoals(goals: string, communityId?: string): string {
    const hash = createHash('sha256');
    hash.update(goals.trim().toLowerCase());
    if (communityId) hash.update(`|${communityId}`);
    return hash.digest('hex');
  }

  private async buildCandidates(userId: string, communityId?: string) {
    const uid = new Types.ObjectId(userId);

    const enrollments = await this.courseEnrollmentModel
      .find({ userId: uid, isActive: true })
      .lean();

    const courseIds = enrollments.map((e) => e.courseId).filter(Boolean);
    const courses = courseIds.length
      ? await this.courseModel.find({ _id: { $in: courseIds } })
      : [];

    const courseMap = new Map<string, CoursDocument>();
    courses.forEach((course) => courseMap.set(course._id.toString(), course));

    const courseCandidates = this.buildCourseCandidates(
      enrollments as any[],
      courseMap as Map<string, any>,
      communityId,
    );

    const challengeCandidates = await this.buildChallengeCandidates(uid, communityId);

    const resourceCandidates = await this.buildResourceCandidates(
      communityId,
      courseCandidates,
      challengeCandidates,
    );

    return [...courseCandidates, ...challengeCandidates, ...resourceCandidates];
  }

  private buildCourseCandidates(
    enrollments: any[],
    courseMap: Map<string, any>,
    communityId?: string,
  ) {
    const candidates: LearningPathItem[] = [];

    for (const enrollment of enrollments) {
      const course = courseMap.get(enrollment.courseId.toString());
      if (!course) continue;
      if (communityId && String(course.communityId) !== communityId) continue;

      const orderedChapters = this.getOrderedChapters(course);
      const progress = enrollment.progression || [];
      const completed = new Set(progress.filter((p) => p.isCompleted).map((p) => p.chapterId));

      let target = null as any;
      for (const entry of orderedChapters) {
        if (completed.has(entry.chapter.id)) continue;

        if (course.sequentialProgression) {
          const access = course.verifierAccesChapitre(entry.chapter.id, progress as any);
          if (access.hasAccess) {
            target = entry;
          } else if (access.requiredChapter) {
            const reqEntry = orderedChapters.find(
              (item) => item.chapter.id === access.requiredChapter!.id,
            );
            if (reqEntry) target = reqEntry;
          }
        } else {
          target = entry;
        }

        if (target && this.hasChapterAccess(course, enrollment, target.chapter)) break;
        target = null;
      }

      if (!target) continue;

      const chapter = target.chapter;
      const section = target.section;

      if (!this.hasChapterAccess(course, enrollment, chapter)) continue;

      const chapterProgress = progress.find((p) => p.chapterId === chapter.id);
      const progressPercent = this.estimateChapterProgressPercent(chapterProgress);

      const item: LearningPathItem = {
        id: `chapter:${course.id}:${chapter.id}`,
        type: 'chapter',
        contentId: chapter.id,
        title: chapter.titre || 'Chapter',
        reason: 'Continue your next lesson.',
        score: 0,
        metadata: {
          courseId: course.id,
          courseTitle: course.titre,
          chapterId: chapter.id,
          sectionId: section.id,
          communityId: String(course.communityId),
          progressPercent,
          description: chapter.contenu?.slice(0, 200) || course.description?.slice(0, 200) || '',
        },
      };
      candidates.push(item);
    }

    return candidates;
  }

  private async buildChallengeCandidates(uid: Types.ObjectId, communityId?: string) {
    const filter: any = {
      'participants.userId': uid,
      isActive: true,
    };

    if (communityId) {
      filter.communityId = communityId;
    }

    const challenges = await this.challengeModel.find(filter).lean();

    const candidates: LearningPathItem[] = [];

    for (const challenge of challenges) {
      const participant = challenge.participants?.find(
        (p: any) => p.userId?.toString() === uid.toString() && p.isActive !== false,
      );
      if (!participant) continue;
      const progress = Number(participant.progress || 0);
      if (progress >= 100) continue;

      const item: LearningPathItem = {
        id: `challenge:${challenge.id || challenge._id.toString()}`,
        type: 'challenge',
        contentId: challenge.id || challenge._id.toString(),
        title: challenge.title || 'Challenge',
        reason: 'Keep progressing in your challenge.',
        score: 0,
        metadata: {
          communityId: String(challenge.communityId),
          progressPercent: progress,
          lastActivityAt: participant.lastActivityAt || participant.joinedAt || challenge.updatedAt,
          description: challenge.description?.slice(0, 200) || '',
          isPremium: Boolean(
            challenge.pricing?.isPremium || Number(challenge.pricing?.price || 0) > 0,
          ),
        },
      };
      candidates.push(item);
    }

    return candidates;
  }

  private async buildResourceCandidates(
    communityId: string | undefined,
    courseCandidates: LearningPathItem[],
    challengeCandidates: LearningPathItem[],
  ) {
    const communityIds = new Set<string>();
    if (communityId) communityIds.add(communityId);

    for (const item of courseCandidates) {
      if (item.metadata?.communityId) communityIds.add(String(item.metadata.communityId));
    }
    for (const item of challengeCandidates) {
      if (item.metadata?.communityId) communityIds.add(String(item.metadata.communityId));
    }

    const ids = Array.from(communityIds)
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    if (ids.length === 0) return [] as LearningPathItem[];

    const resources = await this.resourceModel
      .find({
        isPublished: true,
        isPremium: false,
        communityId: { $in: ids },
      })
      .select('titre description category communityId isPremium viewsCount likesCount sharesCount updatedAt createdAt')
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();

    return resources.map((resource) => {
      const item: LearningPathItem = {
        id: `resource:${resource._id.toString()}`,
        type: 'resource',
        contentId: resource._id.toString(),
        title: resource.titre,
        reason: 'Relevant resource to reinforce your goals.',
        score: 0,
        metadata: {
          communityId: resource.communityId?.toString(),
          description: resource.description?.slice(0, 200) || '',
          category: resource.category,
          isPremium: Boolean(resource.isPremium),
          viewsCount: resource.viewsCount || 0,
          likesCount: resource.likesCount || 0,
          sharesCount: resource.sharesCount || 0,
          updatedAt: resource.updatedAt || resource.createdAt,
        },
      };
      return item;
    });
  }

  private getOrderedChapters(course: any) {
    const sections = [...(course.sections || [])].sort((a, b) => a.ordre - b.ordre);
    const ordered: Array<{ section: any; chapter: any }> = [];
    for (const section of sections) {
      const chapters = [...(section.chapitres || [])].sort((a, b) => a.ordre - b.ordre);
      for (const chapter of chapters) {
        ordered.push({ section, chapter });
      }
    }
    return ordered;
  }

  private hasChapterAccess(course: any, enrollment: any, chapter: any): boolean {
    const isPaid = Boolean(chapter.isPaidChapter || (chapter.prix && chapter.prix > 0));
    if (!isPaid) return true;
    if (chapter.isPreview) return true;
    if ((course as any).isPaidCourse) return true;
    const purchased = enrollment.purchasedChapterIds || [];
    return purchased.includes(chapter.id);
  }

  private estimateChapterProgressPercent(progress?: any): number | undefined {
    if (!progress) return undefined;
    if (progress.isCompleted) return 100;
    if (progress.watchTime && progress.videoDuration) {
      const pct = Math.round((progress.watchTime / progress.videoDuration) * 100);
      return Math.min(Math.max(pct, 0), 99);
    }
    if (progress.watchTime && progress.watchTime > 0) return 5;
    return undefined;
  }

  private scoreCandidate(item: LearningPathItem, goals: string): number {
    let score = 0;

    const lastAccessed =
      item.metadata?.lastAccessedAt || item.metadata?.lastActivityAt || item.metadata?.updatedAt;
    if (lastAccessed) {
      const ageMs = Date.now() - new Date(lastAccessed).getTime();
      const days = ageMs / (1000 * 60 * 60 * 24);
      if (days <= 7) {
        score += Math.round(30 * (1 - days / 7));
      }
    }

    const progressPercent = Number(item.metadata?.progressPercent ?? 0);
    if (progressPercent > 0 && progressPercent < 100) {
      score += 30;
    }

    if (item.type === 'resource') {
      const views = Number(item.metadata?.viewsCount || 0);
      const likes = Number(item.metadata?.likesCount || 0);
      const shares = Number(item.metadata?.sharesCount || 0);
      const engagement = Math.log10(1 + views + likes * 2 + shares * 3) * 10;
      score += Math.min(20, Math.round(engagement));
    }

    score += this.goalMatchScore(goals, item);

    return Math.min(score, 100);
  }

  private goalMatchScore(goals: string, item: LearningPathItem): number {
    const tokens = this.tokenize(goals);
    if (tokens.length === 0) return 0;
    const text = [
      item.title,
      item.metadata?.description,
      item.metadata?.category,
      item.metadata?.courseTitle,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const hits = tokens.filter((token) => text.includes(token)).length;
    return Math.min(20, hits * 5);
  }

  private tokenize(text: string): string[] {
    return String(text || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .map((t) => t.trim())
      .filter((t) => t.length >= 3);
  }

  private mergeRanking(
    heuristic: LearningPathItem[],
    aiRanked: { id: string; rank: number; reason: string }[] | null,
    limit: number,
  ) {
    const byId = new Map(heuristic.map((item) => [item.id, item] as const));

    const final: LearningPathItem[] = [];

    if (aiRanked) {
      const sorted = [...aiRanked]
        .filter((item) => byId.has(item.id))
        .sort((a, b) => a.rank - b.rank);

      for (const item of sorted) {
        const base = byId.get(item.id);
        if (!base) continue;
        final.push({
          ...base,
          reason: item.reason || base.reason,
        });
      }
    }

    if (final.length < limit) {
      for (const item of heuristic) {
        if (final.find((existing) => existing.id === item.id)) continue;
        final.push(item);
        if (final.length >= limit) break;
      }
    }

    return final.slice(0, limit);
  }
}
