import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AnalyticsDaily, AnalyticsDailyDocument } from '../schema/analytics-daily.schema';
import { SubscriptionService } from '../subscription/subscription.service';
import { PlanTier } from '../schema/plan.schema';
import { TrackingAction, TrackingActionType } from '../schema/content-tracking.schema';
import { Cours, CoursSchema } from '../schema/course.schema';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { Ga4ReportingService } from '../ga4/ga4-reporting.service';
import { CacheService } from '../common/services/cache.service';


@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private cache: Map<string, { data: any; expiresAt: number }>; // simple TTL cache
  private readonly creatorObjectIdCache = new Map<string, Types.ObjectId>();
  private readonly analyticsRedisPrefix = 'creator-analytics';
  private readonly defaultCacheTtlMs = 60 * 1000;

  constructor(
    @InjectModel(AnalyticsDaily.name) private readonly dailyModel: Model<AnalyticsDailyDocument>,
    private readonly subscriptionService: SubscriptionService,
    @InjectConnection() private readonly dbConnection: Connection,
    private readonly ga4ReportingService: Ga4ReportingService,
    private readonly cacheService: CacheService,
  ) {
    this.cache = new Map();
  }

  private cacheKey(userId: string, from: string, to: string, scope: string) {
    return `${userId}:${from}:${to}:${scope}`;
  }

  private getRedisCacheKey(key: string): string {
    return `${this.analyticsRedisPrefix}:${key}`;
  }

  private setCache(key: string, value: any, ttlMs = this.defaultCacheTtlMs) {
    this.cache.set(key, { data: value, expiresAt: Date.now() + ttlMs });
    const ttlSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
    void this.cacheService.set(this.getRedisCacheKey(key), value, ttlSeconds);
  }

  private async getCache<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    if (entry) {
      if (Date.now() <= entry.expiresAt) {
        return entry.data as T;
      }
      this.cache.delete(key);
    }

    const redisValue = await this.cacheService.get<T>(this.getRedisCacheKey(key));
    if (redisValue !== undefined) {
      // Keep a short in-process hot cache layer to avoid repetitive deserialization.
      this.cache.set(key, { data: redisValue, expiresAt: Date.now() + this.defaultCacheTtlMs });
      return redisValue;
    }

    return null;
  }

  private async invalidateCreatorCache(creatorId: string): Promise<void> {
    const localPrefix = `${creatorId}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(localPrefix)) {
        this.cache.delete(key);
      }
    }

    const pattern = `${this.analyticsRedisPrefix}:${creatorId}:*`;
    const deleted = await this.cacheService.deletePattern(pattern);
    if (deleted > 0) {
      this.logger.debug(`Invalidated ${deleted} creator analytics cache key(s) for ${creatorId}`);
    }
  }

  private getCreatorObjectId(creatorId: string): Types.ObjectId {
    const cached = this.creatorObjectIdCache.get(creatorId);
    if (cached) return cached;
    const objectId = new Types.ObjectId(creatorId);
    this.creatorObjectIdCache.set(creatorId, objectId);
    return objectId;
  }

  private buildLookupCommunityMatch(path: string, values: Array<string | Types.ObjectId>) {
    return { [path]: { $in: values } };
  }

  private setDailyCommunityFilter(match: Record<string, any>, communityIdStrings: string[]) {
    match.communityId = { $in: communityIdStrings };
  }

  private async resolveCommunityScope(
    creatorId: string,
    communityId?: string,
    communitySlug?: string,
  ): Promise<{
    hasFilter: boolean;
    cacheKeyPart: string;
    communityIdStrings: string[];
    lookupCommunityValues: Array<string | Types.ObjectId>;
    ga4CommunityId?: string;
  }> {
    const candidate = (communityId || communitySlug || '').trim();
    if (!candidate) {
      return {
        hasFilter: false,
        cacheKeyPart: 'all',
        communityIdStrings: [],
        lookupCommunityValues: [],
      };
    }

    const creatorObjectId = this.getCreatorObjectId(creatorId);
    const communitiesCollection = this.dbConnection.db?.collection('communities');
    if (!communitiesCollection) {
      throw new ForbiddenException('Community analytics are temporarily unavailable.');
    }

    const ors: Record<string, any>[] = [{ slug: candidate }, { id: candidate }];
    if (Types.ObjectId.isValid(candidate)) {
      ors.push({ _id: new Types.ObjectId(candidate) });
    }

    const community = await communitiesCollection.findOne(
      { createur: creatorObjectId, $or: ors },
      { projection: { _id: 1, slug: 1, id: 1 } },
    );

    if (!community?._id) {
      throw new ForbiddenException('You do not have access to this community analytics.');
    }

    const stringIds = new Set<string>();
    stringIds.add(community._id.toString());

    if (typeof community.slug === 'string' && community.slug.trim()) {
      stringIds.add(community.slug.trim());
    }
    if (typeof community.id === 'string' && community.id.trim()) {
      stringIds.add(community.id.trim());
    }
    if (candidate) {
      stringIds.add(candidate);
    }

    const communityIdStrings = Array.from(stringIds);
    const lookupCommunityValues: Array<string | Types.ObjectId> = [
      ...communityIdStrings,
      community._id as Types.ObjectId,
    ];

    return {
      hasFilter: true,
      cacheKeyPart: community._id.toString(),
      communityIdStrings,
      lookupCommunityValues,
      ga4CommunityId: community._id.toString(),
    };
  }

  async getCommunities(creatorId: string, from: Date, to: Date) {
    const key = this.cacheKey(creatorId, from.toISOString(), to.toISOString(), 'communities');
    const cached = await this.getCache<any>(key);
    if (cached) return cached;

    // Get communities analytics
    const communities = await this.dbConnection.db?.collection('communities').find({
      createur: new Types.ObjectId(creatorId),
      createdAt: { $gte: from, $lte: to }
    }).toArray() || [];

    const result = {
      total: communities.length,
      active: communities.filter(c => c.isActive).length,
      members: communities.reduce((sum, c) => sum + (c.membersCount || 0), 0),
      averageRating: communities.reduce((sum, c) => sum + (c.averageRating || 0), 0) / communities.length || 0,
      categories: [...new Set(communities.map(c => c.category))],
      communities: communities.map(c => ({
        id: c._id,
        name: c.name,
        members: c.membersCount || 0,
        rating: c.averageRating || 0,
        category: c.category,
        createdAt: c.createdAt
      }))
    };

    this.setCache(key, result);
    return result;
  }

  async getOverview(creatorId: string, from: Date, to: Date, plan?: PlanTier, communityId?: string, communitySlug?: string) {
    if (!plan) {
      const sub = await this.subscriptionService.getMySubscription(creatorId);
      plan = (sub?.plan as PlanTier) || PlanTier.STARTER;
    }
    const communityScope = await this.resolveCommunityScope(creatorId, communityId, communitySlug);
    const key = this.cacheKey(creatorId, from.toISOString(), to.toISOString(), `overview:${communityScope.cacheKeyPart}`);
    const cached = await this.getCache<any>(key);
    if (cached) return this.shapeOverview(cached, plan);

    const match = {
      creatorId: this.getCreatorObjectId(creatorId),
      date: { $gte: from, $lte: to },
    } as any;

    if (communityScope.hasFilter) {
      this.setDailyCommunityFilter(match, communityScope.communityIdStrings);
    }

    const chapterIdExpr = { $ifNull: ['$metadata.chapterId', ''] };
    const isCourseCompleteActionExpr = {
      $and: [
        { $eq: ['$actionType', TrackingActionType.COMPLETE] },
        { $eq: [chapterIdExpr, ''] },
      ],
    };
    const isChapterCompleteActionExpr = {
      $or: [
        { $eq: ['$actionType', TrackingActionType.CHAPTER_COMPLETE] },
        {
          $and: [
            { $eq: ['$actionType', TrackingActionType.COMPLETE] },
            { $ne: [chapterIdExpr, ''] },
          ],
        },
      ],
    };

    // Try GA4 first for interaction counts
    let ga4Totals: any = null;
    try {
      const ga4Counts = await this.ga4ReportingService.getCreatorEventCounts(
        creatorId,
        from.toISOString().slice(0, 10),
        to.toISOString().slice(0, 10),
        communityScope.ga4CommunityId
      );
      if (ga4Counts) {
        ga4Totals = {
          ...ga4Counts,
          watchTime: 0 // Will be merged from Mongo
        };
      }
    } catch (e) {
      // Ignore GA4 errors
    }

    let totalsAgg = await this.dailyModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          views: { $sum: '$views' },
          starts: { $sum: '$starts' },
          completes: { $sum: '$completes' },
          chapterCompletes: { $sum: '$chapterCompletes' },
          likes: { $sum: '$likes' },
          shares: { $sum: '$shares' },
          downloads: { $sum: '$downloads' },
          bookmarks: { $sum: '$bookmarks' },
          watchTime: { $sum: '$watchTime' },
          ratingsCount: { $sum: '$ratingsCount' },
        },
      },
      { $project: { _id: 0 } },
    ]);

    // If no rollups exist yet for this creator, backfill from trackingactions once
    if (!totalsAgg.length && !ga4Totals) {
      await this.backfillForCreator(creatorId, 90);
      totalsAgg = await this.dailyModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            views: { $sum: '$views' },
            starts: { $sum: '$starts' },
            completes: { $sum: '$completes' },
            chapterCompletes: { $sum: '$chapterCompletes' },
            likes: { $sum: '$likes' },
            shares: { $sum: '$shares' },
            downloads: { $sum: '$downloads' },
            bookmarks: { $sum: '$bookmarks' },
            watchTime: { $sum: '$watchTime' },
            ratingsCount: { $sum: '$ratingsCount' },
          },
        },
        { $project: { _id: 0 } },
      ]);
    }

    const mongoTotals = totalsAgg[0] || {
      views: 0,
      starts: 0,
      completes: 0,
      chapterCompletes: 0,
      likes: 0,
      shares: 0,
      downloads: 0,
      bookmarks: 0,
      watchTime: 0,
      ratingsCount: 0,
    };

    const hasMongoActivity =
      mongoTotals.views +
      mongoTotals.starts +
      mongoTotals.completes +
      mongoTotals.chapterCompletes +
      mongoTotals.likes +
      mongoTotals.shares +
      mongoTotals.downloads +
      mongoTotals.bookmarks +
      mongoTotals.ratingsCount >
      0;

    let trackingTotals: any = null;
    if (!ga4Totals && (!totalsAgg.length || !hasMongoActivity)) {
      const tracking = this.dbConnection.collection('trackingactions');
      const contentDoc = {
        $ifNull: [
          { $arrayElemAt: ['$course', 0] },
          {
            $ifNull: [
              { $arrayElemAt: ['$challenge', 0] },
              {
                $ifNull: [
                  { $arrayElemAt: ['$session', 0] },
                  {
                    $ifNull: [
                      { $arrayElemAt: ['$event', 0] },
                      {
                        $ifNull: [
                          { $arrayElemAt: ['$product', 0] },
                          { $arrayElemAt: ['$post', 0] },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const trackingAgg = await tracking
        .aggregate([
          { $match: { timestamp: { $gte: from, $lte: to } } },
          { $lookup: { from: 'cours', localField: 'contentId', foreignField: 'id', as: 'course' } },
          { $lookup: { from: 'challenges', localField: 'contentId', foreignField: 'id', as: 'challenge' } },
          { $lookup: { from: 'sessions', localField: 'contentId', foreignField: 'id', as: 'session' } },
          { $lookup: { from: 'events', localField: 'contentId', foreignField: 'id', as: 'event' } },
          { $lookup: { from: 'products', localField: 'contentId', foreignField: 'id', as: 'product' } },
          { $lookup: { from: 'posts', localField: 'contentId', foreignField: 'id', as: 'post' } },
          { $addFields: { contentDoc } },
          { $addFields: { creatorIdResolved: { $ifNull: ['$contentDoc.creatorId', '$contentDoc.authorId'] } } },
          { $match: { creatorIdResolved: this.getCreatorObjectId(creatorId) } },
          ...(communityScope.hasFilter ? [{ $match: this.buildLookupCommunityMatch('contentDoc.communityId', communityScope.lookupCommunityValues) }] : []),
          {
            $group: {
              _id: null,
              views: { $sum: { $cond: [{ $eq: ['$actionType', 'view'] }, 1, 0] } },
              starts: { $sum: { $cond: [{ $eq: ['$actionType', 'start'] }, 1, 0] } },
              completes: { $sum: { $cond: [isCourseCompleteActionExpr, 1, 0] } },
              chapterCompletes: { $sum: { $cond: [isChapterCompleteActionExpr, 1, 0] } },
              likes: { $sum: { $cond: [{ $eq: ['$actionType', 'like'] }, 1, 0] } },
              shares: { $sum: { $cond: [{ $eq: ['$actionType', 'share'] }, 1, 0] } },
              downloads: { $sum: { $cond: [{ $eq: ['$actionType', 'download'] }, 1, 0] } },
              bookmarks: { $sum: { $cond: [{ $eq: ['$actionType', 'bookmark'] }, 1, 0] } },
              ratingsCount: { $sum: { $cond: [{ $eq: ['$actionType', 'rate'] }, 1, 0] } },
            },
          },
          { $project: { _id: 0 } },
        ])
        .toArray();

      trackingTotals = trackingAgg?.[0] || null;
    }

    const resolvedChapterCompletes =
      Number(trackingTotals?.chapterCompletes ?? mongoTotals.chapterCompletes ?? 0) || 0;

    const totals = ga4Totals
      ? { ...ga4Totals, watchTime: mongoTotals.watchTime, chapterCompletes: resolvedChapterCompletes }
      : trackingTotals
        ? { ...trackingTotals, watchTime: mongoTotals.watchTime, chapterCompletes: resolvedChapterCompletes }
        : mongoTotals;


    // Calculate revenue from orders
    const revenueMatch: any = {
      creatorId: this.getCreatorObjectId(creatorId),
      status: 'paid',
      createdAt: { $gte: from, $lte: to },
    };

    if (communityScope.hasFilter) {
      revenueMatch.communityId = { $in: communityScope.lookupCommunityValues };
    }

    // Note: Orders currently don't store communityId, so we only filter by creator/date/status
    const revenueAgg = await this.dbConnection.db?.collection('orders').aggregate([
      { $match: revenueMatch },
      {
        $group: {
          _id: null,
          total: { $sum: '$creatorNetDT' }, // Use creator net amount
          count: { $sum: 1 }
        }
      },
      { $project: { _id: 0 } }
    ]);

    const revenue = revenueAgg?.[0] || { total: 0, count: 0 };

    // Calculate engagement rate: (interactions / views) * 100
    // Interactions include: starts, completes, likes, shares, downloads, bookmarks
    const interactions = totals.starts + totals.completes + totals.likes + totals.shares + totals.downloads + totals.bookmarks;
    const engagementRate = totals.views > 0 ? (interactions / totals.views) * 100 : 0;

    let trend = await this.dailyModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$date',
          views: { $sum: '$views' },
          starts: { $sum: '$starts' },
          completes: { $sum: '$completes' },
          watchTime: { $sum: '$watchTime' },
        },
      },
      { $project: { _id: 0, date: '$_id', views: 1, starts: 1, completes: 1, watchTime: 1 } },
      { $sort: { date: 1 } },
    ]);

    try {
      const ga4Trend = await this.ga4ReportingService.getCreatorDailyTrend(
        creatorId,
        from.toISOString().slice(0, 10),
        to.toISOString().slice(0, 10),
        communityScope.ga4CommunityId,
      );
      if (ga4Trend.length > 0) {
        trend = ga4Trend;
      }
    } catch {
      // Keep Mongo trend as fallback
    }

    const topContents = await this.dailyModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: { contentType: '$contentType', contentId: '$contentId' },
          views: { $sum: '$views' },
          completes: { $sum: '$completes' },
        },
      },
      { $sort: { views: -1 } },
      { $limit: 3 },
      { $project: { _id: 0, contentType: '$_id.contentType', contentId: '$_id.contentId', views: 1, completes: 1 } },
    ]);

    const full = {
      totals,
      revenue: {
        total: revenue.total,
        count: revenue.count
      },
      engagementRate: Math.round(engagementRate * 100) / 100, // Round to 2 decimal places
      trend,
      topContents
    };
    this.setCache(key, full);
    return this.shapeOverview(full, plan);
  }

  async getCourses(creatorId: string, from: Date, to: Date, communityId?: string, communitySlug?: string) {
    const communityScope = await this.resolveCommunityScope(creatorId, communityId, communitySlug);
    const key = this.cacheKey(creatorId, from.toISOString(), to.toISOString(), `courses:${communityScope.cacheKeyPart}`);
    const cached = await this.getCache<any>(key);
    if (cached) return cached;

    const match = {
      creatorId: this.getCreatorObjectId(creatorId),
      date: { $gte: from, $lte: to },
      contentType: 'course',
    } as any;

    if (communityScope.hasFilter) {
      this.setDailyCommunityFilter(match, communityScope.communityIdStrings);
    }

    const chapterIdExpr = { $ifNull: ['$metadata.chapterId', ''] };
    const isChapterStartActionExpr = {
      $or: [
        { $eq: ['$actionType', TrackingActionType.CHAPTER_START] },
        {
          $and: [
            { $eq: ['$actionType', TrackingActionType.START] },
            { $ne: [chapterIdExpr, ''] },
          ],
        },
      ],
    };
    const isChapterCompleteActionExpr = {
      $or: [
        { $eq: ['$actionType', TrackingActionType.CHAPTER_COMPLETE] },
        {
          $and: [
            { $eq: ['$actionType', TrackingActionType.COMPLETE] },
            { $ne: [chapterIdExpr, ''] },
          ],
        },
      ],
    };

    let byCourse = await this.dailyModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$contentId',
          views: { $sum: '$views' },
          starts: { $sum: '$starts' },
          completes: { $sum: '$completes' },
          chapterCompletes: { $sum: '$chapterCompletes' },
          watchTime: { $sum: '$watchTime' },
          ratingsCount: { $sum: '$ratingsCount' },
        },
      },
      {
        $project: {
          _id: 0,
          contentId: '$_id',
          views: 1,
          starts: 1,
          completes: 1,
          chapterCompletes: 1,
          watchTime: 1,
          ratingsCount: 1,
          completionRate: {
            $cond: [{ $gt: ['$starts', 0] }, { $divide: ['$completes', '$starts'] }, 0],
          },
        },
      },
      { $sort: { views: -1 } },
    ]);

    // If there is no rollup data yet for this creator, attempt a one-time backfill
    if (!byCourse.length) {
      await this.backfillForCreator(creatorId, 90);

      byCourse = await this.dailyModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$contentId',
            views: { $sum: '$views' },
            starts: { $sum: '$starts' },
            completes: { $sum: '$completes' },
            chapterCompletes: { $sum: '$chapterCompletes' },
            watchTime: { $sum: '$watchTime' },
            ratingsCount: { $sum: '$ratingsCount' },
          },
        },
        {
          $project: {
            _id: 0,
            contentId: '$_id',
            views: 1,
            starts: 1,
            completes: 1,
            chapterCompletes: 1,
            watchTime: 1,
            ratingsCount: 1,
            completionRate: {
              $cond: [{ $gt: ['$starts', 0] }, { $divide: ['$completes', '$starts'] }, 0],
            },
          },
        },
        { $sort: { views: -1 } },
      ]);
    }

    // Try GA4 and merge if available
    try {
      const ga4Stats = await this.ga4ReportingService.getCreatorContentStats(
        creatorId,
        'course',
        from.toISOString().slice(0, 10),
        to.toISOString().slice(0, 10),
        communityScope.ga4CommunityId
      );

      if (ga4Stats.length > 0) {
        const mongoMap = new Map(byCourse.map(c => [c.contentId, c]));

        // Use GA4 stats but preserve watchTime from Mongo
        byCourse = ga4Stats.map(s => {
          const m = mongoMap.get(s.contentId) || { watchTime: 0, chapterCompletes: 0 };
          return {
            contentId: s.contentId,
            views: s.views,
            starts: s.starts,
            completes: s.completes,
            chapterCompletes: Number((m as any)?.chapterCompletes || 0),
            watchTime: m.watchTime,
            ratingsCount: s.ratingsCount,
            completionRate: s.starts > 0 ? s.completes / s.starts : 0
          };
        }).sort((a, b) => b.views - a.views);
      }
    } catch (e) {
      // Ignore GA4 errors
    }

    const courseIds = byCourse.map((c: any) => c.contentId).filter(Boolean);
    if (courseIds.length > 0) {
      const courseDocs =
        (await this.dbConnection.db
          ?.collection('cours')
          .find({ id: { $in: courseIds } })
          .project({ id: 1, titre: 1, title: 1, name: 1 })
          .toArray()) || [];
      const titleById = new Map(
        courseDocs.map((c: any) => [
          c.id,
          (c.titre || c.title || c.name || c.id || '').toString(),
        ]),
      );
      byCourse = byCourse.map((c: any) => ({
        ...c,
        title: titleById.get(c.contentId) || c.contentId,
      }));
    }

    const tracking = this.dbConnection.collection('trackingactions');

    const chapterCompletesByCourse = await tracking
      .aggregate([
        { $match: { timestamp: { $gte: from, $lte: to }, contentType: 'course' } },
        { $lookup: { from: 'cours', localField: 'contentId', foreignField: 'id', as: 'course' } },
        { $unwind: '$course' },
        { $match: { 'course.creatorId': this.getCreatorObjectId(creatorId) } },
        ...(communityScope.hasFilter ? [{ $match: this.buildLookupCommunityMatch('course.communityId', communityScope.lookupCommunityValues) }] : []),
        {
          $group: {
            _id: '$contentId',
            chapterCompletes: { $sum: { $cond: [isChapterCompleteActionExpr, 1, 0] } },
          },
        },
        { $project: { _id: 0, contentId: '$_id', chapterCompletes: 1 } },
      ])
      .toArray();

    if (chapterCompletesByCourse.length > 0) {
      const chapterCompletesMap = new Map(
        chapterCompletesByCourse.map((entry: any) => [String(entry.contentId), Number(entry.chapterCompletes || 0)]),
      );
      const existingCourseIds = new Set(byCourse.map((entry: any) => String(entry.contentId)));
      byCourse = byCourse.map((entry: any) => ({
        ...entry,
        chapterCompletes: chapterCompletesMap.get(String(entry.contentId)) ?? Number(entry.chapterCompletes || 0),
      }));

      for (const [contentId, chapterCompletes] of chapterCompletesMap.entries()) {
        if (existingCourseIds.has(contentId)) continue;
        byCourse.push({
          contentId,
          title: contentId,
          views: 0,
          starts: 0,
          completes: 0,
          chapterCompletes,
          watchTime: 0,
          ratingsCount: 0,
          completionRate: 0,
        });
      }

      byCourse.sort((a: any, b: any) => Number(b.views || 0) - Number(a.views || 0));
    }

    // Chapter funnel (drop-offs) from trackingactions metadata if available (chapterId)
    const funnelPipeline: any[] = [
      { $match: { timestamp: { $gte: from, $lte: to }, contentType: 'course' } },
      { $lookup: { from: 'cours', localField: 'contentId', foreignField: 'id', as: 'course' } },
      { $unwind: '$course' },
      { $match: { 'course.creatorId': this.getCreatorObjectId(creatorId) } },
    ];

    if (communityScope.hasFilter) {
      funnelPipeline.push({ $match: this.buildLookupCommunityMatch('course.communityId', communityScope.lookupCommunityValues) });
    }

    funnelPipeline.push(
      {
        $project: {
          contentId: 1,
          actionType: 1,
          chapterId: '$metadata.chapterId',
          chapterIdNormalized: chapterIdExpr,
        },
      },
      { $match: { chapterIdNormalized: { $ne: '' } } },
      {
        $group: {
          _id: { contentId: '$contentId', chapterId: '$chapterIdNormalized' },
          views: { $sum: { $cond: [{ $eq: ['$actionType', 'view'] }, 1, 0] } },
          starts: { $sum: { $cond: [isChapterStartActionExpr, 1, 0] } },
          completes: { $sum: { $cond: [isChapterCompleteActionExpr, 1, 0] } },
        },
      },
      { $project: { _id: 0, contentId: '$_id.contentId', chapterId: '$_id.chapterId', views: 1, starts: 1, completes: 1, completionRate: { $cond: [{ $gt: ['$starts', 0] }, { $divide: ['$completes', '$starts'] }, 0] } } },
      { $sort: { contentId: 1 } },
    );

    const chapterFunnel = await tracking.aggregate(funnelPipeline).toArray();

    this.setCache(key, { byCourse, chapterFunnel });
    return { byCourse, chapterFunnel };
  }

  async getChallenges(creatorId: string, from: Date, to: Date, communityId?: string, communitySlug?: string) {
    const communityScope = await this.resolveCommunityScope(creatorId, communityId, communitySlug);
    const key = this.cacheKey(creatorId, from.toISOString(), to.toISOString(), `challenges:${communityScope.cacheKeyPart}`);
    const cached = await this.getCache<any>(key);
    if (cached) return cached;

    const match = {
      creatorId: this.getCreatorObjectId(creatorId),
      date: { $gte: from, $lte: to },
      contentType: 'challenge',
    } as any;

    if (communityScope.hasFilter) {
      this.setDailyCommunityFilter(match, communityScope.communityIdStrings);
    }

    // Aggregate from AnalyticsDaily for basic metrics
    const byChallenge = await this.dailyModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$contentId',
          views: { $sum: '$views' },
          starts: { $sum: '$starts' },
          completes: { $sum: '$completes' },
          likes: { $sum: '$likes' },
          shares: { $sum: '$shares' },
          bookmarks: { $sum: '$bookmarks' },
        },
      },
      {
        $project: {
          _id: 0,
          contentId: '$_id',
          views: 1,
          starts: 1,
          completes: 1,
          likes: 1,
          shares: 1,
          bookmarks: 1,
          participants: '$starts',
          submissions: '$completes',
          winners: { $floor: { $multiply: [{ $cond: [{ $gt: ['$starts', 0] }, { $divide: ['$completes', '$starts'] }, 0] }, 0.3] } },
          completionRate: { $cond: [{ $gt: ['$starts', 0] }, { $multiply: [{ $divide: ['$completes', '$starts'] }, 100] }, 0] }
        }
      },
      { $sort: { completes: -1 } },
    ]);

    // Prefer GA4 content stats when available
    try {
      const ga4Stats = await this.ga4ReportingService.getCreatorContentStats(
        creatorId,
        'challenge',
        from.toISOString().slice(0, 10),
        to.toISOString().slice(0, 10),
        communityScope.ga4CommunityId,
      );

      if (ga4Stats.length > 0) {
        byChallenge.length = 0;
        for (const s of ga4Stats) {
          const completionRate = s.starts > 0 ? (s.completes / s.starts) * 100 : 0;
          byChallenge.push({
            contentId: s.contentId,
            views: s.views,
            starts: s.starts,
            completes: s.completes,
            likes: s.likes,
            shares: s.shares,
            bookmarks: s.bookmarks,
            participants: s.starts,
            submissions: s.completes,
            winners: completionRate >= 90 ? Math.max(1, Math.floor(s.completes * 0.3)) : 0,
            completionRate,
          });
        }
        byChallenge.sort((a: any, b: any) => Number(b.completes || 0) - Number(a.completes || 0));
      }
    } catch {
      // Keep Mongo aggregate
    }

    // Get challenge titles
    const challengeIds = byChallenge.map((c: any) => c.contentId).filter(Boolean);
    if (challengeIds.length > 0) {
      const challengeDocs =
        (await this.dbConnection.db
          ?.collection('challenges')
          .find({ id: { $in: challengeIds } })
          .project({ id: 1, title: 1, tasks: 1 })
          .toArray()) || [];
      const titleById = new Map(
        challengeDocs.map((c: any) => [
          c.id,
          (c.title || c.id || '').toString(),
        ]),
      );
      const tasksById = new Map(
        challengeDocs.map((c: any) => [
          c.id,
          c.tasks?.length || 0,
        ]),
      );

      // Update with titles and recalculate winners based on task completion
      for (const c of byChallenge) {
        c.title = titleById.get(c.contentId) || c.contentId;
        const totalTasks = tasksById.get(c.contentId) || 1;
        // Winners are users who completed all tasks (approximated by having completionRate >= 90%)
        c.winners = c.completionRate >= 90 ? Math.max(1, Math.floor(c.completes * 0.3)) : 0;
      }
    }

    // Task-level funnel using trackingactions metadata.taskId
    const tracking = this.dbConnection.collection('trackingactions');
    const funnelPipeline: any[] = [
      { $match: { timestamp: { $gte: from, $lte: to }, contentType: 'challenge' } },
      { $lookup: { from: 'challenges', localField: 'contentId', foreignField: 'id', as: 'challenge' } },
      { $unwind: '$challenge' },
      { $match: { 'challenge.creatorId': this.getCreatorObjectId(creatorId) } },
    ];

    if (communityScope.hasFilter) {
      funnelPipeline.push({ $match: this.buildLookupCommunityMatch('challenge.communityId', communityScope.lookupCommunityValues) });
    }

    funnelPipeline.push(
      { $project: { contentId: 1, actionType: 1, taskId: '$metadata.taskId', userId: 1, metadata: 1 } },
      { $match: { taskId: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: { contentId: '$contentId', taskId: '$taskId' },
          uniqueUsers: { $addToSet: '$userId' },
          starts: { $sum: { $cond: [{ $eq: ['$actionType', 'start'] }, 1, 0] } },
          completes: { $sum: { $cond: [{ $eq: ['$actionType', 'complete'] }, 1, 0] } },
        },
      },
      { $project: { _id: 0, contentId: '$_id.contentId', taskId: '$_id.taskId', starts: 1, completes: 1, uniqueUsers: { $size: '$uniqueUsers' }, completionRate: { $cond: [{ $gt: ['$starts', 0] }, { $divide: ['$completes', '$starts'] }, 0] } } },
      { $sort: { contentId: 1 } },
    );

    const stepFunnel = await tracking.aggregate(funnelPipeline).toArray();

    // Get distinct participants per challenge from tracking
    const participantsPipeline: any[] = [
      { $match: { timestamp: { $gte: from, $lte: to }, contentType: 'challenge', actionType: 'start' } },
      { $lookup: { from: 'challenges', localField: 'contentId', foreignField: 'id', as: 'challenge' } },
      { $unwind: '$challenge' },
      { $match: { 'challenge.creatorId': this.getCreatorObjectId(creatorId) } },
    ];

    if (communityScope.hasFilter) {
      participantsPipeline.push({ $match: this.buildLookupCommunityMatch('challenge.communityId', communityScope.lookupCommunityValues) });
    }

    participantsPipeline.push(
      { $group: { _id: { contentId: '$contentId', userId: '$userId' } } },
      { $group: { _id: '$_id.contentId', participants: { $sum: 1 } } },
      { $project: { _id: 0, contentId: '$_id', participants: 1 } }
    );

    const participantsData = await tracking.aggregate(participantsPipeline).toArray();
    const participantsMap = new Map(participantsData.map(p => [p.contentId, p.participants]));

    // Merge participants into byChallenge
    for (const c of byChallenge) {
      c.participants = participantsMap.get(c.contentId) || c.starts || 0;
    }

    // FALLBACK: If no rollup data, build challenge list from trackingactions directly
    if (byChallenge.length === 0) {
      const trackingAggPipeline: any[] = [
        { $match: { timestamp: { $gte: from, $lte: to }, contentType: 'challenge' } },
        { $lookup: { from: 'challenges', localField: 'contentId', foreignField: 'id', as: 'challenge' } },
        { $unwind: '$challenge' },
      { $match: { 'challenge.creatorId': this.getCreatorObjectId(creatorId) } },
      ];

      if (communityScope.hasFilter) {
        trackingAggPipeline.push({ $match: this.buildLookupCommunityMatch('challenge.communityId', communityScope.lookupCommunityValues) });
      }

      trackingAggPipeline.push(
        {
          $group: {
            _id: '$contentId',
            views: { $sum: { $cond: [{ $eq: ['$actionType', 'view'] }, 1, 0] } },
            starts: { $sum: { $cond: [{ $eq: ['$actionType', 'start'] }, 1, 0] } },
            completes: { $sum: { $cond: [{ $eq: ['$actionType', 'complete'] }, 1, 0] } },
            likes: { $sum: { $cond: [{ $eq: ['$actionType', 'like'] }, 1, 0] } },
            shares: { $sum: { $cond: [{ $eq: ['$actionType', 'share'] }, 1, 0] } },
            bookmarks: { $sum: { $cond: [{ $eq: ['$actionType', 'bookmark'] }, 1, 0] } },
            challengeTitle: { $first: '$challenge.title' },
            challengeTasks: { $first: '$challenge.tasks' },
          },
        },
        {
          $project: {
            _id: 0,
            contentId: '$_id',
            views: 1,
            starts: 1,
            completes: 1,
            likes: 1,
            shares: 1,
            bookmarks: 1,
            participants: '$starts',
            submissions: '$completes',
            winners: { $floor: { $multiply: [{ $cond: [{ $gt: ['$starts', 0] }, { $divide: ['$completes', '$starts'] }, 0] }, 0.3] } },
            completionRate: { $cond: [{ $gt: ['$starts', 0] }, { $multiply: [{ $divide: ['$completes', '$starts'] }, 100] }, 0] },
            title: '$challengeTitle',
            totalTasks: { $size: { $ifNull: ['$challengeTasks', []] } },
          },
        },
        { $sort: { completes: -1 } },
      );

      const trackingResults = await tracking.aggregate(trackingAggPipeline).toArray();

      // Recalculate winners based on completion rate
      for (const c of trackingResults) {
        c.winners = c.completionRate >= 90 ? Math.max(1, Math.floor(c.completes * 0.3)) : 0;
        // Override participants with distinct count from participantsMap if available
        c.participants = participantsMap.get(c.contentId) || c.starts || 0;
      }

      if (trackingResults.length > 0) {
        this.setCache(key, { byChallenge: trackingResults, stepFunnel });
        return { byChallenge: trackingResults, stepFunnel };
      }
    }

    // FINAL FALLBACK: Query actual challenge documents + submissions collection directly
    // This ensures data shows up even when no tracking events or rollup data exist
    try {
      const challengeQuery: any = { creatorId: this.getCreatorObjectId(creatorId) }; // removed isActive: true to show historical data
      if (communityScope.hasFilter) {
        challengeQuery.communityId = { $in: communityScope.lookupCommunityValues };
      }

      const challengeDocs = await this.dbConnection.db
        ?.collection('challenges')
        .find(challengeQuery)
        .project({ id: 1, _id: 1, title: 1, tasks: 1, participants: 1, communityId: 1 })
        .toArray() || [];

      if (challengeDocs.length > 0) {
        const challengeObjectIds = challengeDocs.map((c: any) => c._id);

        // Count submissions within the date range
        const submissionCounts = await this.dbConnection.db
          ?.collection('challengesubmissions')
          .aggregate([
            {
              $match: {
                challengeId: { $in: challengeObjectIds },
                createdAt: { $gte: from, $lte: to } // Filter by date range
              }
            },
            { $group: { _id: '$challengeId', count: { $sum: 1 } } },
          ])
          .toArray() || [];

        const submissionMap = new Map(
          submissionCounts.map((s: any) => [s._id.toString(), s.count]),
        );

        if (byChallenge.length === 0) {
          // No rollup or tracking data at all — build from challenge docs
          const liveData = challengeDocs.map((c: any) => {
            // Filter participants by joinedAt date range
            const participantsList = Array.isArray(c.participants) ? c.participants : [];
            const periodParticipants = participantsList.filter((p: any) => {
              const joinedAt = new Date(p.joinedAt || p.createdAt || 0);
              return joinedAt >= from && joinedAt <= to;
            }).length;

            const submissionCount = submissionMap.get(c._id.toString()) || 0;
            const totalTasks = Array.isArray(c.tasks) ? c.tasks.length : 0;
            const completionRate = periodParticipants > 0
              ? (submissionCount / (periodParticipants * Math.max(totalTasks, 1))) * 100
              : 0;

            // Only include if there's activity or we really want to show valid challenges with 0 activity?
            // Usually analytics shows items with 0 activity if they exist? 
            // Better to show them.

            return {
              contentId: c.id || c._id.toString(),
              title: c.title || c.id || 'Untitled Challenge',
              views: periodParticipants, // Proxy views with starts for fallback
              starts: periodParticipants,
              completes: submissionCount > 0 ? Math.ceil(submissionCount / Math.max(totalTasks, 1)) : 0, // Approx
              likes: 0,
              shares: 0,
              bookmarks: 0,
              participants: periodParticipants, // Valid for the period
              submissions: submissionCount,
              winners: 0,
              completionRate: Math.round(completionRate),
              totalTasks,
            };
          });

          // Sort by submissions or starts
          liveData.sort((a: any, b: any) => b.submissions - a.submissions);

          this.setCache(key, { byChallenge: liveData, stepFunnel });
          return { byChallenge: liveData, stepFunnel };
        } else {
          // Enrich existing byChallenge entries
          // Note: Rollup data is already date-filtered. 
          // If we enrich, we should use the period-filtered fallback data too.
          const liveMap = new Map(
            challengeDocs.map((c: any) => {
              const participantsList = Array.isArray(c.participants) ? c.participants : [];
              const periodParticipants = participantsList.filter((p: any) => {
                const joinedAt = new Date(p.joinedAt || p.createdAt || 0);
                return joinedAt >= from && joinedAt <= to;
              }).length;

              return [
                c.id || c._id.toString(),
                {
                  participants: periodParticipants,
                  submissions: submissionMap.get(c._id.toString()) || 0,
                },
              ];
            }),
          );

          for (const c of byChallenge) {
            const live = liveMap.get(c.contentId);
            if (live) {
              // Only override if live data is greater (missing tracking)
              // But wait, if rollup says 0 and live says 5, usage live.
              c.participants = Math.max(c.participants || 0, live.participants);
              c.submissions = Math.max(c.submissions || 0, live.submissions);
            }
          }
        }
      }
    } catch (liveErr) {
      console.warn('[AnalyticsService] Live challenge data fallback error:', liveErr);
    }

    this.setCache(key, { byChallenge, stepFunnel });
    return { byChallenge, stepFunnel };
  }

  async getSessions(creatorId: string, from: Date, to: Date, communityId?: string, communitySlug?: string) {
    const communityScope = await this.resolveCommunityScope(creatorId, communityId, communitySlug);
    const key = this.cacheKey(creatorId, from.toISOString(), to.toISOString(), `sessions:${communityScope.cacheKeyPart}`);
    const cached = await this.getCache<any>(key);
    if (cached) return cached;
    const match = { creatorId: this.getCreatorObjectId(creatorId), date: { $gte: from, $lte: to }, contentType: 'session' } as any;

    if (communityScope.hasFilter) {
      this.setDailyCommunityFilter(match, communityScope.communityIdStrings);
    }

    const bySession = await this.dailyModel.aggregate([
      { $match: match },
      { $group: { _id: '$contentId', views: { $sum: '$views' }, starts: { $sum: '$starts' }, completes: { $sum: '$completes' } } },
      { $project: { _id: 0, contentId: '$_id', views: 1, starts: 1, completes: 1, completionRate: { $cond: [{ $gt: ['$starts', 0] }, { $divide: ['$completes', '$starts'] }, 0] } } },
      { $sort: { views: -1 } },
    ]);
    try {
      const ga4Stats = await this.ga4ReportingService.getCreatorContentStats(
        creatorId,
        'session',
        from.toISOString().slice(0, 10),
        to.toISOString().slice(0, 10),
        communityScope.ga4CommunityId,
      );
      if (ga4Stats.length > 0) {
        bySession.length = 0;
        for (const s of ga4Stats) {
          bySession.push({
            contentId: s.contentId,
            views: s.views,
            starts: s.starts,
            completes: s.completes,
            completionRate: s.starts > 0 ? s.completes / s.starts : 0,
          });
        }
        bySession.sort((a: any, b: any) => Number(b.views || 0) - Number(a.views || 0));
      }
    } catch {
      // Keep Mongo aggregate
    }
    this.setCache(key, { bySession });
    return { bySession };
  }

  async getEvents(creatorId: string, from: Date, to: Date, communityId?: string, communitySlug?: string) {
    const communityScope = await this.resolveCommunityScope(creatorId, communityId, communitySlug);
    const key = this.cacheKey(creatorId, from.toISOString(), to.toISOString(), `events:${communityScope.cacheKeyPart}`);
    const cached = await this.getCache<any>(key);
    if (cached) return cached;
    const match = { creatorId: this.getCreatorObjectId(creatorId), date: { $gte: from, $lte: to }, contentType: 'event' } as any;

    if (communityScope.hasFilter) {
      this.setDailyCommunityFilter(match, communityScope.communityIdStrings);
    }

    const byEvent = await this.dailyModel.aggregate([
      { $match: match },
      { $group: { _id: '$contentId', views: { $sum: '$views' }, starts: { $sum: '$starts' }, completes: { $sum: '$completes' } } },
      { $project: { _id: 0, contentId: '$_id', views: 1, starts: 1, completes: 1 } },
      { $sort: { views: -1 } },
    ]);
    try {
      const ga4Stats = await this.ga4ReportingService.getCreatorContentStats(
        creatorId,
        'event',
        from.toISOString().slice(0, 10),
        to.toISOString().slice(0, 10),
        communityScope.ga4CommunityId,
      );
      if (ga4Stats.length > 0) {
        byEvent.length = 0;
        for (const s of ga4Stats) {
          byEvent.push({
            contentId: s.contentId,
            views: s.views,
            starts: s.starts,
            completes: s.completes,
          });
        }
        byEvent.sort((a: any, b: any) => Number(b.views || 0) - Number(a.views || 0));
      }
    } catch {
      // Keep Mongo aggregate
    }
    this.setCache(key, { byEvent });
    return { byEvent };
  }

  async getProducts(creatorId: string, from: Date, to: Date, communityId?: string, communitySlug?: string) {
    const communityScope = await this.resolveCommunityScope(creatorId, communityId, communitySlug);
    const key = this.cacheKey(creatorId, from.toISOString(), to.toISOString(), `products:${communityScope.cacheKeyPart}`);
    const cached = await this.getCache<any>(key);
    if (cached) return cached;
    const match = { creatorId: this.getCreatorObjectId(creatorId), date: { $gte: from, $lte: to }, contentType: 'product' } as any;

    if (communityScope.hasFilter) {
      this.setDailyCommunityFilter(match, communityScope.communityIdStrings);
    }

    const byProduct = await this.dailyModel.aggregate([
      { $match: match },
      { $group: { _id: '$contentId', views: { $sum: '$views' }, likes: { $sum: '$likes' }, shares: { $sum: '$shares' }, downloads: { $sum: '$downloads' } } },
      { $project: { _id: 0, contentId: '$_id', views: 1, likes: 1, shares: 1, downloads: 1 } },
      { $sort: { views: -1 } },
    ]);
    try {
      const ga4Stats = await this.ga4ReportingService.getCreatorContentStats(
        creatorId,
        'product',
        from.toISOString().slice(0, 10),
        to.toISOString().slice(0, 10),
        communityScope.ga4CommunityId,
      );
      if (ga4Stats.length > 0) {
        byProduct.length = 0;
        for (const s of ga4Stats) {
          byProduct.push({
            contentId: s.contentId,
            views: s.views,
            likes: s.likes,
            shares: s.shares,
            downloads: s.downloads,
          });
        }
        byProduct.sort((a: any, b: any) => Number(b.views || 0) - Number(a.views || 0));
      }
    } catch {
      // Keep Mongo aggregate
    }
    this.setCache(key, { byProduct });
    return { byProduct };
  }

  async getPosts(creatorId: string, from: Date, to: Date, communityId?: string, communitySlug?: string) {
    const communityScope = await this.resolveCommunityScope(creatorId, communityId, communitySlug);
    const key = this.cacheKey(creatorId, from.toISOString(), to.toISOString(), `posts:${communityScope.cacheKeyPart}`);
    const cached = await this.getCache<any>(key);
    if (cached) return cached;
    const match = { creatorId: this.getCreatorObjectId(creatorId), date: { $gte: from, $lte: to }, contentType: 'post' } as any;

    if (communityScope.hasFilter) {
      this.setDailyCommunityFilter(match, communityScope.communityIdStrings);
    }

    const byPost = await this.dailyModel.aggregate([
      { $match: match },
      { $group: { _id: '$contentId', views: { $sum: '$views' }, likes: { $sum: '$likes' }, shares: { $sum: '$shares' }, bookmarks: { $sum: '$bookmarks' }, ratingsCount: { $sum: '$ratingsCount' } } },
      { $project: { _id: 0, contentId: '$_id', views: 1, likes: 1, shares: 1, bookmarks: 1, ratingsCount: 1 } },
      { $sort: { views: -1 } },
    ]);
    try {
      const ga4Stats = await this.ga4ReportingService.getCreatorContentStats(
        creatorId,
        'post',
        from.toISOString().slice(0, 10),
        to.toISOString().slice(0, 10),
        communityScope.ga4CommunityId,
      );
      if (ga4Stats.length > 0) {
        byPost.length = 0;
        for (const s of ga4Stats) {
          byPost.push({
            contentId: s.contentId,
            views: s.views,
            likes: s.likes,
            shares: s.shares,
            bookmarks: s.bookmarks,
            ratingsCount: s.ratingsCount,
          });
        }
        byPost.sort((a: any, b: any) => Number(b.views || 0) - Number(a.views || 0));
      }
    } catch {
      // Keep Mongo aggregate
    }
    this.setCache(key, { byPost });
    return { byPost };
  }

  // Build daily rollups for a specific creator and day (UTC boundaries)
  async rollupDayForCreator(
    creatorId: string,
    day: Date,
    options?: { skipInvalidation?: boolean },
  ) {
    const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 0, 0, 0));
    const end = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 23, 59, 59, 999));

    const tracking = this.dbConnection.collection('trackingactions');

    // Helper to build aggregate for a specific type
    const buildTypeAgg = async (type: string, collectionName: string) => {
      const chapterIdExpr = { $ifNull: ['$metadata.chapterId', ''] };
      const completesCondition =
        type === 'course'
          ? {
              $and: [
                { $eq: ['$actionType', TrackingActionType.COMPLETE] },
                { $eq: [chapterIdExpr, ''] },
              ],
            }
          : { $eq: ['$actionType', TrackingActionType.COMPLETE] };
      const chapterCompletesCondition =
        type === 'course'
          ? {
              $or: [
                { $eq: ['$actionType', TrackingActionType.CHAPTER_COMPLETE] },
                {
                  $and: [
                    { $eq: ['$actionType', TrackingActionType.COMPLETE] },
                    { $ne: [chapterIdExpr, ''] },
                  ],
                },
              ],
            }
          : false;

      return tracking.aggregate([
        { $match: { timestamp: { $gte: start, $lte: end }, contentType: type } },
        { $lookup: { from: collectionName, localField: 'contentId', foreignField: 'id', as: 'meta' } },
        { $unwind: { path: '$meta', preserveNullAndEmptyArrays: false } },
        { $match: { 'meta.creatorId': new Types.ObjectId(creatorId) } },
        {
          $group: {
            _id: { contentId: '$contentId' },
            communityId: { $first: '$meta.communityId' },
            views: { $sum: { $cond: [{ $eq: ['$actionType', 'view'] }, 1, 0] } },
            starts: { $sum: { $cond: [{ $eq: ['$actionType', 'start'] }, 1, 0] } },
            completes: { $sum: { $cond: [completesCondition, 1, 0] } },
            chapterCompletes: { $sum: { $cond: [chapterCompletesCondition, 1, 0] } },
            likes: { $sum: { $cond: [{ $eq: ['$actionType', 'like'] }, 1, 0] } },
            shares: { $sum: { $cond: [{ $eq: ['$actionType', 'share'] }, 1, 0] } },
            downloads: { $sum: { $cond: [{ $eq: ['$actionType', 'download'] }, 1, 0] } },
            bookmarks: { $sum: { $cond: [{ $eq: ['$actionType', 'bookmark'] }, 1, 0] } },
            ratingsCount: { $sum: { $cond: [{ $eq: ['$actionType', 'rate'] }, 1, 0] } },
            users: { $addToSet: '$userId' },
          },
        },
        { $project: { _id: 0, contentId: '$_id.contentId', communityId: 1, views: 1, starts: 1, completes: 1, chapterCompletes: 1, likes: 1, shares: 1, downloads: 1, bookmarks: 1, ratingsCount: 1, uniqueUsers: { $size: '$users' } } },
      ]).toArray();
    };

    const courseAgg = await buildTypeAgg('course', 'cours');
    const challengeAgg = await buildTypeAgg('challenge', 'challenges');
    const sessionAgg = await buildTypeAgg('session', 'sessions');
    const eventAgg = await buildTypeAgg('event', 'events');
    const productAgg = await buildTypeAgg('product', 'products');
    const postAgg = await buildTypeAgg('post', 'posts');

    const docs: any[] = [];
    courseAgg.forEach(c => docs.push({ creatorId: new Types.ObjectId(creatorId), contentType: 'course', ...c, date: start }));
    challengeAgg.forEach(c => docs.push({ creatorId: new Types.ObjectId(creatorId), contentType: 'challenge', ...c, date: start }));
    sessionAgg.forEach(c => docs.push({ creatorId: new Types.ObjectId(creatorId), contentType: 'session', ...c, date: start }));
    eventAgg.forEach(c => docs.push({ creatorId: new Types.ObjectId(creatorId), contentType: 'event', ...c, date: start }));
    productAgg.forEach(c => docs.push({ creatorId: new Types.ObjectId(creatorId), contentType: 'product', ...c, date: start }));
    postAgg.forEach(c => docs.push({ creatorId: new Types.ObjectId(creatorId), contentType: 'post', ...c, date: start }));

    for (const d of docs) {
      await this.dailyModel.updateOne(
        { creatorId: d.creatorId, contentType: d.contentType, contentId: d.contentId, date: d.date },
        { $set: d },
        { upsert: true },
      );
    }

    if (!options?.skipInvalidation) {
      await this.invalidateCreatorCache(creatorId);
    }
    return { updated: docs.length, date: start.toISOString() };
  }

  async backfillForCreator(creatorId: string, days: number = 90) {
    const today = new Date();
    let count = 0;
    for (let i = days; i >= 0; i--) {
      const day = new Date(today.getTime() - i * 24 * 3600 * 1000);
      const r = await this.rollupDayForCreator(creatorId, day, { skipInvalidation: true });
      count += r.updated;
    }
    await this.invalidateCreatorCache(creatorId);
    return { ok: true, updated: count };
  }

  private isMeaningfulDeviceValue(device: string | undefined | null): boolean {
    const value = (device || '').trim().toLowerCase();
    return (
      value !== '' &&
      value !== 'unknown' &&
      value !== '(not set)' &&
      value !== 'not set' &&
      value !== '(not provided)' &&
      value !== 'undefined' &&
      value !== 'null'
    );
  }

  private normalizeText(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeIpAddress(value: unknown): string | null {
    const raw = this.normalizeText(value);
    if (!raw) return null;
    const candidate = raw.split(',')[0]?.trim();
    if (!candidate) return null;
    return candidate.startsWith('::ffff:') ? candidate.slice(7) : candidate;
  }

  private extractDeviceModelFromUserAgent(userAgent: string | null): string | null {
    if (!userAgent) return null;

    const iosMatch = userAgent.match(/\((iPhone|iPad|iPod)[^)]*\)/i);
    if (iosMatch?.[1]) return iosMatch[1];

    const androidBuildMatch = userAgent.match(/Android[^;)]*;\s*([^;)]+?)\s*Build\//i);
    if (androidBuildMatch?.[1]) return androidBuildMatch[1].trim();

    const androidGenericMatch = userAgent.match(/Android[^;)]*;\s*([^;)]+?)\)/i);
    if (androidGenericMatch?.[1]) return androidGenericMatch[1].trim();

    if (/\bMacintosh\b/i.test(userAgent)) return 'Mac';
    if (/\bWindows\b/i.test(userAgent)) return 'Windows PC';

    return null;
  }

  private buildTrackingScopePipeline(
    creatorId: string,
    from: Date | null,
    to: Date | null,
    communityScope: { hasFilter: boolean; lookupCommunityValues: Array<string | Types.ObjectId> },
  ) {
    const contentDoc = {
      $ifNull: [
        { $arrayElemAt: ['$course', 0] },
        {
          $ifNull: [
            { $arrayElemAt: ['$challenge', 0] },
            {
              $ifNull: [
                { $arrayElemAt: ['$session', 0] },
                {
                  $ifNull: [
                    { $arrayElemAt: ['$event', 0] },
                    {
                      $ifNull: [
                        { $arrayElemAt: ['$product', 0] },
                        { $arrayElemAt: ['$post', 0] },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const pipeline: any[] = [];
    if (from && to) {
      pipeline.push({ $match: { timestamp: { $gte: from, $lte: to } } });
    }

    pipeline.push(
      { $lookup: { from: 'cours', localField: 'contentId', foreignField: 'id', as: 'course' } },
      { $lookup: { from: 'challenges', localField: 'contentId', foreignField: 'id', as: 'challenge' } },
      { $lookup: { from: 'sessions', localField: 'contentId', foreignField: 'id', as: 'session' } },
      { $lookup: { from: 'events', localField: 'contentId', foreignField: 'id', as: 'event' } },
      { $lookup: { from: 'products', localField: 'contentId', foreignField: 'id', as: 'product' } },
      { $lookup: { from: 'posts', localField: 'contentId', foreignField: 'id', as: 'post' } },
      { $addFields: { contentDoc } },
      { $addFields: { creatorIdResolved: { $ifNull: ['$contentDoc.creatorId', '$contentDoc.authorId'] } } },
      { $match: { creatorIdResolved: this.getCreatorObjectId(creatorId) } },
    );

    if (communityScope.hasFilter) {
      pipeline.push({ $match: this.buildLookupCommunityMatch('contentDoc.communityId', communityScope.lookupCommunityValues) });
    }

    return pipeline;
  }

  private async resolveLatestKnownIps(
    tracking: any,
    creatorId: string,
    communityScope: { hasFilter: boolean; lookupCommunityValues: Array<string | Types.ObjectId> },
    userIds: string[],
  ): Promise<Map<string, string>> {
    const normalizedUserIds = Array.from(new Set(userIds.filter((value) => Types.ObjectId.isValid(value))));
    if (!normalizedUserIds.length) return new Map();

    const objectIds = normalizedUserIds.map((value) => new Types.ObjectId(value));
    const basePipeline = this.buildTrackingScopePipeline(creatorId, null, null, communityScope);

    const rows = await tracking.aggregate([
      ...basePipeline,
      { $match: { userId: { $in: objectIds } } },
      {
        $project: {
          userId: 1,
          timestamp: 1,
          ipAddress: {
            $ifNull: [
              '$metadata.ipAddress',
              {
                $ifNull: [
                  '$metadata.ip',
                  {
                    $ifNull: [
                      '$metadata.clientIp',
                      {
                        $ifNull: ['$metadata.remoteIp', '$metadata.ip_address'],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
      {
        $match: {
          ipAddress: {
            $nin: [null, '', 'unknown', '(not set)', 'not set', '(not provided)', 'undefined', 'null'],
          },
        },
      },
      { $sort: { timestamp: -1 } },
      { $group: { _id: '$userId', ipAddress: { $first: '$ipAddress' } } },
      { $project: { _id: 0, userId: '$_id', ipAddress: 1 } },
    ]).toArray();

    const map = new Map<string, string>();
    rows.forEach((row: any) => {
      const userId = row?.userId ? row.userId.toString() : null;
      const ipAddress = this.normalizeIpAddress(row?.ipAddress);
      if (userId && ipAddress) {
        map.set(userId, ipAddress);
      }
    });

    return map;
  }

  private buildDeviceAggregatePipeline(basePipeline: any[]) {
    return [
      ...basePipeline,
      { $addFields: { uaLower: { $toLower: { $ifNull: ['$metadata.userAgent', ''] } } } },
      {
        $project: {
          userId: 1,
          device: {
            $ifNull: [
              '$metadata.device',
              {
                $cond: [
                  {
                    $or: [
                      { $regexMatch: { input: '$uaLower', regex: 'ipad|tablet|playbook|silk' } },
                      {
                        $and: [
                          { $regexMatch: { input: '$uaLower', regex: 'android' } },
                          { $not: [{ $regexMatch: { input: '$uaLower', regex: 'mobile' } }] },
                        ],
                      },
                    ],
                  },
                  'tablet',
                  {
                    $cond: [
                      { $regexMatch: { input: '$uaLower', regex: 'mobi|iphone|ipod|iemobile|blackberry|kindle|opera mini|windows phone|android' } },
                      'mobile',
                      'desktop',
                    ],
                  },
                ],
              },
            ],
          },
          os: { $ifNull: ['$metadata.os', 'unknown'] },
          browser: { $ifNull: ['$metadata.browser', 'unknown'] },
        },
      },
      { $group: { _id: { device: '$device', os: '$os', browser: '$browser', userId: '$userId' } } },
      { $group: { _id: { device: '$_id.device', os: '$_id.os', browser: '$_id.browser' }, count: { $sum: 1 } } },
      { $project: { _id: 0, device: '$_id.device', os: '$_id.os', browser: '$_id.browser', count: 1 } },
      { $sort: { count: -1 } },
    ];
  }

  private buildDeviceDetailsPipeline(basePipeline: any[]) {
    return [
      ...basePipeline,
      { $addFields: { uaLower: { $toLower: { $ifNull: ['$metadata.userAgent', ''] } } } },
      {
        $project: {
          userId: 1,
          timestamp: 1,
          userAgent: { $ifNull: ['$metadata.userAgent', null] },
          device: {
            $ifNull: [
              '$metadata.device',
              {
                $cond: [
                  {
                    $or: [
                      { $regexMatch: { input: '$uaLower', regex: 'ipad|tablet|playbook|silk' } },
                      {
                        $and: [
                          { $regexMatch: { input: '$uaLower', regex: 'android' } },
                          { $not: [{ $regexMatch: { input: '$uaLower', regex: 'mobile' } }] },
                        ],
                      },
                    ],
                  },
                  'tablet',
                  {
                    $cond: [
                      { $regexMatch: { input: '$uaLower', regex: 'mobi|iphone|ipod|iemobile|blackberry|kindle|opera mini|windows phone|android' } },
                      'mobile',
                      'desktop',
                    ],
                  },
                ],
              },
            ],
          },
          os: { $ifNull: ['$metadata.os', 'unknown'] },
          browser: { $ifNull: ['$metadata.browser', 'unknown'] },
          ipAddress: {
            $ifNull: [
              '$metadata.ipAddress',
              {
                $ifNull: [
                  '$metadata.ip',
                  { $ifNull: ['$metadata.clientIp', '$metadata.remoteIp'] },
                ],
              },
            ],
          },
          deviceModel: {
            $ifNull: [
              '$metadata.deviceModel',
              { $ifNull: ['$metadata.model', '$metadata.device_name'] },
            ],
          },
        },
      },
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: {
            userId: '$userId',
            device: '$device',
            os: '$os',
            browser: '$browser',
            ipAddress: '$ipAddress',
          },
          lastSeenAt: { $first: '$timestamp' },
          eventsCount: { $sum: 1 },
          userAgent: { $first: '$userAgent' },
          deviceModel: { $first: '$deviceModel' },
        },
      },
      { $lookup: { from: 'users', localField: '_id.userId', foreignField: '_id', as: 'user' } },
      { $addFields: { user: { $arrayElemAt: ['$user', 0] } } },
      {
        $project: {
          _id: 0,
          userId: '$_id.userId',
          userName: '$user.name',
          userEmail: '$user.email',
          device: '$_id.device',
          os: '$_id.os',
          browser: '$_id.browser',
          ipAddress: '$_id.ipAddress',
          lastSeenAt: 1,
          eventsCount: 1,
          userAgent: 1,
          deviceModel: 1,
        },
      },
      { $sort: { lastSeenAt: -1 } },
      { $limit: 100 },
    ];
  }

  private async queryTrackingDeviceDetails(tracking: any, pipeline: any[]) {
    const rawRows = await tracking.aggregate(pipeline).toArray();
    return rawRows.map((entry: any) => {
      const userAgent = this.normalizeText(entry?.userAgent);
      const explicitModel = this.normalizeText(entry?.deviceModel);
      const inferredModel = this.extractDeviceModelFromUserAgent(userAgent);
      const deviceModel = explicitModel || inferredModel;
      return {
        userId: entry?.userId ? entry.userId.toString() : null,
        userName: this.normalizeText(entry?.userName),
        userEmail: this.normalizeText(entry?.userEmail),
        device: this.normalizeText(entry?.device),
        deviceModel,
        os: this.normalizeText(entry?.os),
        browser: this.normalizeText(entry?.browser),
        ipAddress: this.normalizeIpAddress(entry?.ipAddress),
        lastSeenAt: entry?.lastSeenAt || null,
        eventsCount: Number(entry?.eventsCount || 0),
      };
    });
  }

  async getDevices(creatorId: string, from: Date, to: Date, communityId?: string, communitySlug?: string) {
    const communityScope = await this.resolveCommunityScope(creatorId, communityId, communitySlug);
    const key = this.cacheKey(creatorId, from.toISOString(), to.toISOString(), `devices:${communityScope.cacheKeyPart}`);
    const cached = await this.getCache<any>(key);
    if (cached) return cached;

    const tracking = this.dbConnection.collection('trackingactions');
    const queryTracking = async () => {
      const basePipeline = this.buildTrackingScopePipeline(creatorId, from, to, communityScope);
      let rows = await tracking.aggregate(this.buildDeviceAggregatePipeline(basePipeline)).toArray();
      const meaningfulRows = rows.filter((row: any) => this.isMeaningfulDeviceValue(row?.device));
      if (meaningfulRows.length > 0) {
        rows = meaningfulRows;
      }
      let details = await this.queryTrackingDeviceDetails(
        tracking,
        this.buildDeviceDetailsPipeline(basePipeline),
      );

      const userIdsMissingIp = details
        .filter((entry: any) => !entry?.ipAddress && typeof entry?.userId === 'string')
        .map((entry: any) => entry.userId as string);

      if (userIdsMissingIp.length > 0) {
        const fallbackIps = await this.resolveLatestKnownIps(
          tracking,
          creatorId,
          communityScope,
          userIdsMissingIp,
        );
        details = details.map((entry: any) => {
          if (entry?.ipAddress || !entry?.userId) return entry;
          const fallbackIp = fallbackIps.get(entry.userId);
          if (!fallbackIp) return entry;
          return {
            ...entry,
            ipAddress: fallbackIp,
          };
        });
      }

      return { rows, details };
    };

    let trackingResult = await queryTracking();

    let ga4Rows: any[] | null = null;
    try {
      const ga4Devices = await this.ga4ReportingService.getCreatorDevices(
        creatorId,
        from.toISOString().slice(0, 10),
        to.toISOString().slice(0, 10),
        communityScope.ga4CommunityId,
      );

      const meaningful = ga4Devices.filter((device) => this.isMeaningfulDeviceValue(device.device));
      if (meaningful.length > 0) {
        ga4Rows = meaningful.map((device) => ({
          device: device.device,
          count: device.count,
        }));
      }
    } catch {
      // Ignore GA4 errors and rely on Mongo tracking data.
    }

    if (!ga4Rows?.length && !trackingResult.rows.length && !trackingResult.details.length) {
      await this.backfillForCreator(creatorId, 90);
      trackingResult = await queryTracking();
    }

    const result = {
      rows: ga4Rows?.length ? ga4Rows : trackingResult.rows,
      details: trackingResult.details,
    };

    this.setCache(key, result, 60 * 1000);
    return result;
  }

  private isMeaningfulAttributionValue(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const normalized = value.trim().toLowerCase();
    return (
      normalized !== '' &&
      normalized !== 'unknown' &&
      normalized !== '(not set)' &&
      normalized !== 'not set' &&
      normalized !== '(not provided)' &&
      normalized !== '(none)' &&
      normalized !== 'none' &&
      normalized !== 'undefined' &&
      normalized !== 'null' &&
      normalized !== 'n/a'
    );
  }

  private normalizeAttributionValue(value: unknown): string | null {
    if (!this.isMeaningfulAttributionValue(value)) return null;
    return (value as string).trim();
  }

  private extractReferrerDomain(referrer: string | null): string | null {
    if (!referrer) return null;
    const raw = referrer.trim();
    if (!raw) return null;
    if (raw.toLowerCase() === 'direct' || raw.toLowerCase() === '(direct)') return null;

    const normalizeHost = (host: string): string | null => {
      const normalizedHost = host.trim().toLowerCase().replace(/^www\./, '');
      return normalizedHost.length > 0 ? normalizedHost : null;
    };

    try {
      const url = new URL(raw);
      return normalizeHost(url.hostname);
    } catch {
      // Ignore, try to coerce host below.
    }

    try {
      const url = new URL(`https://${raw}`);
      return normalizeHost(url.hostname);
    } catch {
      // Ignore, fallback below.
    }

    if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(raw)) {
      return normalizeHost(raw);
    }

    return null;
  }

  private resolveReferrerChannel(input: {
    domain: string | null;
    utmSource: string | null;
    utmMedium: string | null;
    rawReferrer: string | null;
  }): 'direct' | 'search' | 'social' | 'email' | 'paid' | 'referral' {
    const domain = (input.domain || '').toLowerCase();
    const source = (input.utmSource || '').toLowerCase();
    const medium = (input.utmMedium || '').toLowerCase();
    const referrer = (input.rawReferrer || '').toLowerCase();

    const hasDirectHint =
      source === 'direct' ||
      source === '(direct)' ||
      medium === 'direct' ||
      referrer === 'direct' ||
      referrer === '(direct)';
    if (hasDirectHint || (!domain && !source && !medium && !referrer)) return 'direct';

    if (
      /email|newsletter/.test(medium) ||
      /email|newsletter/.test(source) ||
      domain.includes('mail.google.com')
    ) {
      return 'email';
    }

    if (/cpc|ppc|paid|display|affiliate|sponsored/.test(medium)) return 'paid';

    const socialDomains = [
      'facebook.com',
      'instagram.com',
      'linkedin.com',
      'twitter.com',
      'x.com',
      'tiktok.com',
      'youtube.com',
      'reddit.com',
      'pinterest.com',
      'snapchat.com',
      'telegram.org',
      't.me',
      'discord.com',
      'whatsapp.com',
    ];
    if (
      /social/.test(medium) ||
      socialDomains.some((value) => domain.endsWith(value)) ||
      /facebook|instagram|linkedin|twitter|x|tiktok|youtube|reddit|pinterest|snapchat|telegram|discord|whatsapp/.test(source)
    ) {
      return 'social';
    }

    const searchDomains = ['google.', 'bing.com', 'duckduckgo.com', 'yahoo.', 'baidu.com', 'yandex.', 'ecosia.org'];
    if (
      /organic|search|seo/.test(medium) ||
      searchDomains.some((value) => domain.includes(value)) ||
      /google|bing|duckduckgo|yahoo|baidu|yandex|ecosia/.test(source)
    ) {
      return 'search';
    }

    return 'referral';
  }

  private resolveReferrerSourceName(input: {
    domain: string | null;
    utmSource: string | null;
    rawReferrer: string | null;
  }): string {
    if (input.domain) return input.domain;
    if (input.utmSource) return input.utmSource;
    if (input.rawReferrer) return input.rawReferrer;
    return 'Direct';
  }

  private formatReferrerRows(rows: any[]) {
    return rows
      .map((row: any) => {
        const rawReferrer = this.normalizeAttributionValue(row?.referrer);
        const utmSource = this.normalizeAttributionValue(row?.utm_source);
        const utmMedium = this.normalizeAttributionValue(row?.utm_medium);
        const utmCampaign = this.normalizeAttributionValue(row?.utm_campaign);
        const domain = this.extractReferrerDomain(rawReferrer);
        const channel = this.resolveReferrerChannel({
          domain,
          utmSource,
          utmMedium,
          rawReferrer,
        });
        const source = this.resolveReferrerSourceName({
          domain,
          utmSource,
          rawReferrer,
        });
        const count = Number(row?.count || 0);
        const uniqueUsers = Number.isFinite(Number(row?.uniqueUsers))
          ? Number(row?.uniqueUsers)
          : undefined;
        const lastSeenAt = row?.lastSeenAt || null;

        return {
          source,
          channel,
          domain,
          referrer: rawReferrer,
          utm_source: utmSource,
          utm_medium: utmMedium,
          utm_campaign: utmCampaign,
          count,
          uniqueUsers,
          lastSeenAt,
        };
      })
      .filter((row: any) => row.count > 0)
      .sort((a: any, b: any) => b.count - a.count)
      .slice(0, 50);
  }

  private summarizeReferrerRows(rows: any[], provider: 'ga4' | 'tracking') {
    const totalEvents = rows.reduce((acc: number, row: any) => acc + Number(row?.count || 0), 0);
    const channelTotals = rows.reduce((acc: Record<string, number>, row: any) => {
      const channel = row?.channel || 'referral';
      acc[channel] = (acc[channel] || 0) + Number(row?.count || 0);
      return acc;
    }, {});

    const topChannel = (Object.entries(channelTotals) as Array<[string, number]>)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    return {
      provider,
      totalEvents,
      sources: rows.length,
      topChannel,
      topSource: rows[0]?.source || null,
    };
  }

  async getReferrers(creatorId: string, from: Date, to: Date, communityId?: string, communitySlug?: string) {
    const communityScope = await this.resolveCommunityScope(creatorId, communityId, communitySlug);
    const key = this.cacheKey(creatorId, from.toISOString(), to.toISOString(), `referrers:${communityScope.cacheKeyPart}`);
    const cached = await this.getCache<any>(key);
    if (cached) return cached;

    // Try GA4 first
    try {
      const ga4Referrers = await this.ga4ReportingService.getCreatorReferrers(
        creatorId,
        from.toISOString().slice(0, 10),
        to.toISOString().slice(0, 10),
        communityScope.ga4CommunityId
      );
      if (ga4Referrers.length > 0) {
        const rows = this.formatReferrerRows(ga4Referrers.map(r => ({
          referrer: r.referrer,
          count: r.count,
          utm_source: null,
          utm_medium: null,
          utm_campaign: null,
        })));
        if (rows.length > 0) {
          const result = { rows, summary: this.summarizeReferrerRows(rows, 'ga4') };
          this.setCache(key, result, 60 * 1000);
          return result;
        }
      }
    } catch (e) {
      // Ignore
    }

    const tracking = this.dbConnection.collection('trackingactions');

    const buildPipeline = () => {
      const basePipeline = this.buildTrackingScopePipeline(creatorId, from, to, communityScope);
      return [
        ...basePipeline,
        {
          $project: {
            userId: 1,
            timestamp: 1,
            referrer: '$metadata.referrer',
            utm_source: '$metadata.utm_source',
            utm_medium: '$metadata.utm_medium',
            utm_campaign: '$metadata.utm_campaign',
          },
        },
        {
          $group: {
            _id: {
              referrer: '$referrer',
              utm_source: '$utm_source',
              utm_medium: '$utm_medium',
              utm_campaign: '$utm_campaign',
            },
            count: { $sum: 1 },
            users: { $addToSet: '$userId' },
            lastSeenAt: { $max: '$timestamp' },
          },
        },
        {
          $project: {
            _id: 0,
            referrer: '$_id.referrer',
            utm_source: '$_id.utm_source',
            utm_medium: '$_id.utm_medium',
            utm_campaign: '$_id.utm_campaign',
            count: 1,
            uniqueUsers: { $size: '$users' },
            lastSeenAt: 1,
          },
        },
        { $sort: { count: -1 } },
        { $limit: 100 },
      ];
    };

    let rows = await tracking.aggregate(buildPipeline()).toArray();

    if (!rows.length) {
      await this.backfillForCreator(creatorId, 90);
      rows = await tracking.aggregate(buildPipeline()).toArray();
    }

    const formattedRows = this.formatReferrerRows(rows);
    const result = {
      rows: formattedRows,
      summary: this.summarizeReferrerRows(formattedRows, 'tracking'),
    };

    this.setCache(key, result, 60 * 1000);
    return result;
  }

  async exportCsv(creatorId: string, scope: 'overview' | 'courses' | 'challenges' | 'sessions' | 'events' | 'products' | 'posts', from: Date, to: Date, communityId?: string, communitySlug?: string) {
    // Restrictions removed: CSV export available for everyone
    // const sub = await this.subscriptionService.getMySubscription(creatorId);
    // const plan = (sub?.plan as PlanTier) || PlanTier.STARTER;

    if (scope === 'overview') {
      const data = await this.getOverview(creatorId, from, to, PlanTier.PRO, communityId, communitySlug);
      const rows = [
        ['metric', 'value'],
        ['views', data.totals.views],
        ['starts', data.totals.starts],
        ['completes', data.totals.completes],
        ['chapterCompletes', data.totals.chapterCompletes],
        ['likes', data.totals.likes],
        ['shares', data.totals.shares],
        ['downloads', data.totals.downloads],
        ['bookmarks', data.totals.bookmarks],
        ['watchTime', data.totals.watchTime],
        ['ratingsCount', data.totals.ratingsCount],
        ['revenue', data.revenue.total],
        ['salesCount', data.revenue.count],
        ['engagementRate', data.engagementRate],
      ];
      return { filename: 'overview.csv', csv: this.toCsv(rows) };
    }

    if (scope === 'courses') {
      const res = await this.getCourses(creatorId, from, to, communityId, communitySlug);
      const head = ['contentId', 'views', 'starts', 'completes', 'chapterCompletes', 'completionRate', 'watchTime', 'ratingsCount'];
      const rows = [head, ...res.byCourse.map((c: any) => [c.contentId, c.views, c.starts, c.completes, c.chapterCompletes || 0, c.completionRate, c.watchTime, c.ratingsCount])];
      return { filename: 'courses.csv', csv: this.toCsv(rows) };
    }

    if (scope === 'challenges') {
      const res = await this.getChallenges(creatorId, from, to, communityId, communitySlug);
      const head = ['contentId', 'views', 'starts', 'completes', 'completionRate'];
      const rows = [head, ...res.byChallenge.map((c: any) => [c.contentId, c.views, c.starts, c.completes, c.completionRate])];
      return { filename: 'challenges.csv', csv: this.toCsv(rows) };
    }

    if (scope === 'sessions') {
      const res = await this.getSessions(creatorId, from, to, communityId, communitySlug);
      const head = ['contentId', 'views', 'starts', 'completes', 'completionRate'];
      const rows = [head, ...res.bySession.map((c: any) => [c.contentId, c.views, c.starts, c.completes, c.completionRate])];
      return { filename: 'sessions.csv', csv: this.toCsv(rows) };
    }

    if (scope === 'events') {
      const res = await this.getEvents(creatorId, from, to, communityId, communitySlug);
      const head = ['contentId', 'views', 'starts', 'completes'];
      const rows = [head, ...res.byEvent.map((c: any) => [c.contentId, c.views, c.starts, c.completes])];
      return { filename: 'events.csv', csv: this.toCsv(rows) };
    }

    if (scope === 'products') {
      const res = await this.getProducts(creatorId, from, to, communityId, communitySlug);
      const head = ['contentId', 'views', 'likes', 'shares', 'downloads'];
      const rows = [head, ...res.byProduct.map((c: any) => [c.contentId, c.views, c.likes, c.shares, c.downloads])];
      return { filename: 'products.csv', csv: this.toCsv(rows) };
    }

    // posts
    const res = await this.getPosts(creatorId, from, to, communityId, communitySlug);
    const head = ['contentId', 'views', 'likes', 'shares', 'bookmarks', 'ratingsCount'];
    const rows = [head, ...res.byPost.map((c: any) => [c.contentId, c.views, c.likes, c.shares, c.bookmarks, c.ratingsCount])];
    return { filename: 'posts.csv', csv: this.toCsv(rows) };
  }

  private toCsv(rows: (string | number)[][]) {
    return rows.map(r => r.map(v => (v === null || v === undefined) ? '' : String(v).replace(/"/g, '""')).map(v => /[",\n]/.test(v) ? `"${v}"` : v).join(',')).join('\n');
  }

  private shapeOverview(full: any, plan: PlanTier) {
    const baseData = {
      totals: full.totals,
      revenue: full.revenue,
      avgEngagement: full.engagementRate,
      engagementRate: full.engagementRate,
    };

    // Always return full data regardless of plan
    return {
      ...baseData,
      views: Number(full?.totals?.views ?? 0) || 0,
      viewsTotal: Number(full?.totals?.views ?? 0) || 0,
      starts: Number(full?.totals?.starts ?? 0) || 0,
      completes: Number(full?.totals?.completes ?? 0) || 0,
      chapterCompletes: Number(full?.totals?.chapterCompletes ?? 0) || 0,
      completions: Number(full?.totals?.completes ?? 0) || 0,
      completionRate:
        (Number(full?.totals?.starts ?? 0) || 0) > 0
          ? ((Number(full?.totals?.completes ?? 0) || 0) / (Number(full?.totals?.starts ?? 0) || 0)) * 100
          : 0,
      avgDuration:
        (Number(full?.totals?.starts ?? 0) || 0) > 0
          ? Math.round((Number(full?.totals?.watchTime ?? 0) / (Number(full?.totals?.starts ?? 0) || 1)) / 60)
          : 0,
      averageDuration:
        (Number(full?.totals?.starts ?? 0) || 0) > 0
          ? Math.round((Number(full?.totals?.watchTime ?? 0) / (Number(full?.totals?.starts ?? 0) || 1)) / 60)
          : 0,
      trend7d: full.trend.slice(-7),
      trend28d: full.trend.slice(-28),
      trendAll: full.trend,
      topContents: full.topContents,
    };
  }

  async getCourseAnalytics(creatorId: string, courseId: string, from: Date, to: Date) {
    const key = this.cacheKey(creatorId, `${courseId}:${from.toISOString()}`, to.toISOString(), 'course');
    const cached = await this.getCache<any>(key);
    if (cached) return cached;

    // Get course basic info
    const course = await this.dbConnection.db?.collection('cours').findOne({ id: courseId });
    if (!course) {
      return {
        error: 'Course not found'
      };
    }

    // Get enrollment stats
    const enrollments = await this.dbConnection.db?.collection('courseenrollments').find({
      courseId: new Types.ObjectId(course._id)
    }).toArray() || [];

    // Get tracking data for this specific course
    const tracking = this.dbConnection.collection('trackingactions');
    const courseTracking = await tracking.aggregate([
      {
        $match: {
          timestamp: { $gte: from, $lte: to },
          contentType: 'course',
          contentId: courseId
        }
      },
      {
        $addFields: {
          chapterId: { $ifNull: ['$metadata.chapterId', ''] },
        },
      },
      {
        $group: {
          _id: null,
          views: { $sum: { $cond: [{ $eq: ['$actionType', TrackingActionType.VIEW] }, 1, 0] } },
          starts: { $sum: { $cond: [{ $eq: ['$actionType', TrackingActionType.START] }, 1, 0] } },
          completes: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$actionType', TrackingActionType.COMPLETE] },
                    { $eq: ['$chapterId', ''] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          chapterCompletes: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $eq: ['$actionType', TrackingActionType.CHAPTER_COMPLETE] },
                    {
                      $and: [
                        { $eq: ['$actionType', TrackingActionType.COMPLETE] },
                        { $ne: ['$chapterId', ''] },
                      ],
                    },
                  ],
                },
                1,
                0,
              ],
            },
          },
        }
      }
    ]).toArray();

    // Calculate completion rates
    const progress = await this.dbConnection.db?.collection('courseenrollments').aggregate([
      {
        $match: {
          courseId: new Types.ObjectId(course._id)
        }
      },
      {
        $unwind: '$progression'
      },
      {
        $group: {
          _id: null,
          totalProgressItems: { $sum: 1 },
          completedItems: { $sum: { $cond: [{ $eq: ['$progression.isCompleted', true] }, 1, 0] } }
        }
      }
    ]).toArray();

    const progressStats = progress?.[0] || { totalProgressItems: 0, completedItems: 0 };
    const completionRate = progressStats.totalProgressItems > 0
      ? (progressStats.completedItems / progressStats.totalProgressItems) * 100
      : 0;

    // Get revenue data
    const revenueStats = enrollments.reduce((total, enrollment) => {
      return total + (course.prix || 0);
    }, 0);

    // Get daily trend for this course from internal rollups
    const dailyTrend = await this.dailyModel.aggregate([
      {
        $match: {
          creatorId: new Types.ObjectId(creatorId),
          contentType: 'course',
          contentId: courseId,
          date: { $gte: from, $lte: to }
        }
      },
      {
        $project: {
          date: 1,
          views: 1,
          starts: 1,
          completes: 1,
          watchTime: 1
        }
      },
      { $sort: { date: 1 } }
    ]);

    // Optionally override trend with GA4 time series when configured
    let trendForCourse = dailyTrend;
    try {
      if (process.env.USE_GA4_COURSE_TREND === 'true') {
        const ga4Trend = await this.ga4ReportingService.getContentTimeSeries(
          courseId,
          'course',
          from.toISOString().slice(0, 10),
          to.toISOString().slice(0, 10),
        );
        if (ga4Trend.length > 0) {
          trendForCourse = ga4Trend.map((row) => ({
            date: row.date,
            views: row.views,
            starts: row.starts,
            completes: row.completes,
            watchTime: 0,
          }));
        }
      }
    } catch {
      // Fail silently and keep Mongo-based trend
    }

    // Get chapter completion data
    const chapterStats = await this.dbConnection.db?.collection('courseenrollments').aggregate([
      {
        $match: {
          courseId: new Types.ObjectId(course._id)
        }
      },
      { $unwind: '$progression' },
      {
        $group: {
          _id: '$progression.chapterId',
          totalStarts: { $sum: 1 },
          completedCount: { $sum: { $cond: [{ $eq: ['$progression.isCompleted', true] }, 1, 0] } }
        }
      },
      {
        $lookup: {
          from: 'cours',
          localField: '_id',
          foreignField: 'sections.chapitres.id',
          as: 'chapter'
        }
      },
      {
        $project: {
          chapterId: '$_id',
          totalStarts: 1,
          completedCount: 1,
          completionRate: {
            $cond: [
              { $gt: ['$totalStarts', 0] },
              { $multiply: [{ $divide: ['$completedCount', '$totalStarts'] }, 100] },
              0
            ]
          }
        }
      },
      { $sort: { totalStarts: -1 } }
    ]).toArray() || [];

    const analytics = {
      courseId: courseId,
      courseTitle: course.titre,
      enrollmentCount: enrollments.length,
      totalRevenue: revenueStats,
      views: courseTracking?.[0]?.views || 0,
      starts: courseTracking?.[0]?.starts || 0,
      completes: courseTracking?.[0]?.completes || 0,
      chapterCompletes: courseTracking?.[0]?.chapterCompletes || 0,
      completionRate: Math.round(completionRate * 100) / 100,
      dailyTrend: trendForCourse,
      chapterStats: chapterStats.map(stat => ({
        chapterId: stat.chapterId,
        totalStarts: stat.totalStarts,
        completedCount: stat.completedCount,
        completionRate: Math.round(stat.completionRate * 100) / 100
      })),
      averageWatchTime: dailyTrend.length > 0
        ? dailyTrend.reduce((sum, day) => sum + (day.watchTime || 0), 0) / dailyTrend.length
        : 0
    };

    this.setCache(key, analytics);
    return analytics;
  }

  async debugCreatorStatus(creatorId: string, communityId?: string, communitySlug?: string) {
    const communityScope = await this.resolveCommunityScope(creatorId, communityId, communitySlug);
    const tracking = this.dbConnection.collection('trackingactions');
    const coursesCol = this.dbConnection.collection('cours');

    // 1. Check raw tracking actions for this creator's courses
    const trackingSummary = await tracking.aggregate([
      { $match: { contentType: 'course' } },
      {
        $lookup: {
          from: 'cours',
          localField: 'contentId',
          foreignField: 'id',
          as: 'courseInfo'
        }
      },
      { $unwind: '$courseInfo' },
      { $match: { 'courseInfo.creatorId': this.getCreatorObjectId(creatorId) } },
      ...(communityScope.hasFilter ? [{ $match: this.buildLookupCommunityMatch('courseInfo.communityId', communityScope.lookupCommunityValues) }] : []),
      {
        $group: {
          _id: { action: '$actionType', contentId: '$contentId' },
          count: { $sum: 1 },
          communityId: { $first: '$courseInfo.communityId' }
        }
      }
    ]).toArray();

    // 2. Count tracking actions for ALL content types
    const trackingByAllTypes = await tracking.aggregate([
      { $group: { _id: '$contentType', count: { $sum: 1 } } }
    ]).toArray();

    // 3. Check rollups in analytics_daily
    const match: any = { creatorId: this.getCreatorObjectId(creatorId) };
    if (communityScope.hasFilter) this.setDailyCommunityFilter(match, communityScope.communityIdStrings);

    const rollupSummary = await this.dailyModel.aggregate([
      { $match: match },
      { $group: { _id: '$contentType', count: { $sum: 1 }, totalViews: { $sum: '$views' }, totalStarts: { $sum: '$starts' } } }
    ]);

    // 4. Check course id vs _id usage for a sample course
    const sampleCourse = await coursesCol.findOne({ creatorId: new Types.ObjectId(creatorId) });

    return {
      creatorId,
      communityIdFilter: communityScope.cacheKeyPart,
      trackingSummary,
      trackingByAllTypes,
      rollupSummary,
      courseMapping: sampleCourse ? {
        mongoId: sampleCourse._id,
        customId: sampleCourse.id,
        communityId: sampleCourse.communityId
      } : 'No courses found'
    };
  }
}
