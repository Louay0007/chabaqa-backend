import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AnalyticsDaily, AnalyticsDailyDocument } from '../schema/analytics-daily.schema';
import { SubscriptionService } from '../subscription/subscription.service';
import { PlanTier } from '../schema/plan.schema';
import { TrackingAction, TrackingActionType } from '../schema/content-tracking.schema';
import { Cours, CoursSchema } from '../schema/course.schema';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';


@Injectable()
export class AnalyticsService {
  private cache: Map<string, { data: any; expiresAt: number }>; // simple TTL cache

  constructor(
    @InjectModel(AnalyticsDaily.name) private readonly dailyModel: Model<AnalyticsDailyDocument>,
    private readonly subscriptionService: SubscriptionService,
    @InjectConnection() private readonly dbConnection: Connection,
  ) {
    this.cache = new Map();
  }

  private cacheKey(userId: string, from: string, to: string, scope: string) {
    return `${userId}:${from}:${to}:${scope}`;
  }

  private setCache(key: string, value: any, ttlMs = 10 * 60 * 1000) {
    this.cache.set(key, { data: value, expiresAt: Date.now() + ttlMs });
  }

  private getCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  async getCommunities(creatorId: string, from: Date, to: Date) {
    const key = this.cacheKey(creatorId, from.toISOString(), to.toISOString(), 'communities');
    const cached = this.getCache<any>(key);
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

  async getOverview(creatorId: string, from: Date, to: Date, plan?: PlanTier, communityId?: string) {
    if (!plan) {
      const sub = await this.subscriptionService.getMySubscription(creatorId);
      plan = (sub?.plan as PlanTier) || PlanTier.STARTER;
    }
    const key = this.cacheKey(creatorId, from.toISOString(), to.toISOString(), `overview:${communityId || 'all'}`);
    const cached = this.getCache<any>(key);
    if (cached) return this.shapeOverview(cached, plan);

    const match = {
      creatorId: new Types.ObjectId(creatorId),
      date: { $gte: from, $lte: to },
    } as any;

    if (communityId) {
      match.communityId = new Types.ObjectId(communityId);
    }

    const totalsAgg = await this.dailyModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          views: { $sum: '$views' },
          starts: { $sum: '$starts' },
          completes: { $sum: '$completes' },
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

    const totals = totalsAgg[0] || {
      views: 0,
      starts: 0,
      completes: 0,
      likes: 0,
      shares: 0,
      downloads: 0,
      bookmarks: 0,
      watchTime: 0,
      ratingsCount: 0,
    };

    // Calculate revenue from orders
    const revenueMatch: any = {
      creatorId: new Types.ObjectId(creatorId),
      status: 'paid',
      createdAt: { $gte: from, $lte: to },
    };

    if (communityId) {
      revenueMatch.communityId = new Types.ObjectId(communityId);
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

    const trend = await this.dailyModel.aggregate([
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

  async getCourses(creatorId: string, from: Date, to: Date) {
    const key = this.cacheKey(creatorId, from.toISOString(), to.toISOString(), 'courses');
    const cached = this.getCache<any>(key);
    if (cached) return cached;

    const match = {
      creatorId: new Types.ObjectId(creatorId),
      date: { $gte: from, $lte: to },
      contentType: 'course',
    } as any;

    const byCourse = await this.dailyModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$contentId',
          views: { $sum: '$views' },
          starts: { $sum: '$starts' },
          completes: { $sum: '$completes' },
          watchTime: { $sum: '$watchTime' },
          ratingsCount: { $sum: '$ratingsCount' },
        },
      },
      { $project: { _id: 0, contentId: '$_id', views: 1, starts: 1, completes: 1, watchTime: 1, ratingsCount: 1, completionRate: { $cond: [{ $gt: ['$starts', 0] }, { $divide: ['$completes', '$starts'] }, 0] } } },
      { $sort: { views: -1 } },
    ]);

    // Chapter funnel (drop-offs) from trackingactions metadata if available (chapterId)
    const tracking = this.dbConnection.collection('trackingactions');
    const chapterFunnel = await tracking.aggregate([
      { $match: { timestamp: { $gte: from, $lte: to }, contentType: 'course' } },
      { $lookup: { from: 'cours', localField: 'contentId', foreignField: 'id', as: 'course' } },
      { $unwind: '$course' },
      { $match: { 'course.creatorId': new Types.ObjectId(creatorId) } },
      { $project: { contentId: 1, actionType: 1, chapterId: '$metadata.chapterId' } },
      { $match: { chapterId: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: { contentId: '$contentId', chapterId: '$chapterId' },
          views: { $sum: { $cond: [{ $eq: ['$actionType', 'view'] }, 1, 0] } },
          starts: { $sum: { $cond: [{ $eq: ['$actionType', 'start'] }, 1, 0] } },
          completes: { $sum: { $cond: [{ $eq: ['$actionType', 'complete'] }, 1, 0] } },
        },
      },
      { $project: { _id: 0, contentId: '$_id.contentId', chapterId: '$_id.chapterId', views: 1, starts: 1, completes: 1, completionRate: { $cond: [{ $gt: ['$starts', 0] }, { $divide: ['$completes', '$starts'] }, 0] } } },
      { $sort: { contentId: 1 } },
    ]).toArray();

    this.setCache(key, { byCourse, chapterFunnel });
    return { byCourse, chapterFunnel };
  }

  async getChallenges(creatorId: string, from: Date, to: Date) {
    const key = this.cacheKey(creatorId, from.toISOString(), to.toISOString(), 'challenges');
    const cached = this.getCache<any>(key);
    if (cached) return cached;

    const match = {
      creatorId: new Types.ObjectId(creatorId),
      date: { $gte: from, $lte: to },
      contentType: 'challenge',
    } as any;

    const byChallenge = await this.dailyModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$contentId',
          views: { $sum: '$views' },
          starts: { $sum: '$starts' },
          completes: { $sum: '$completes' },
        },
      },
      { $project: { _id: 0, contentId: '$_id', views: 1, starts: 1, completes: 1, completionRate: { $cond: [{ $gt: ['$starts', 0] }, { $divide: ['$completes', '$starts'] }, 0] } } },
      { $sort: { completes: -1 } },
    ]);

    // Step-level funnel using trackingactions metadata.taskId
    const tracking = this.dbConnection.collection('trackingactions');
    const stepFunnel = await tracking.aggregate([
      { $match: { timestamp: { $gte: from, $lte: to }, contentType: 'challenge' } },
      { $lookup: { from: 'challenges', localField: 'contentId', foreignField: 'id', as: 'challenge' } },
      { $unwind: '$challenge' },
      { $match: { 'challenge.creatorId': new Types.ObjectId(creatorId) } },
      { $project: { contentId: 1, actionType: 1, taskId: '$metadata.taskId' } },
      { $match: { taskId: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: { contentId: '$contentId', taskId: '$taskId' },
          starts: { $sum: { $cond: [{ $eq: ['$actionType', 'start'] }, 1, 0] } },
          completes: { $sum: { $cond: [{ $eq: ['$actionType', 'complete'] }, 1, 0] } },
        },
      },
      { $project: { _id: 0, contentId: '$_id.contentId', taskId: '$_id.taskId', starts: 1, completes: 1, completionRate: { $cond: [{ $gt: ['$starts', 0] }, { $divide: ['$completes', '$starts'] }, 0] } } },
      { $sort: { contentId: 1 } },
    ]).toArray();

    this.setCache(key, { byChallenge, stepFunnel });
    return { byChallenge, stepFunnel };
  }

  async getSessions(creatorId: string, from: Date, to: Date) {
    const key = this.cacheKey(creatorId, from.toISOString(), to.toISOString(), 'sessions');
    const cached = this.getCache<any>(key);
    if (cached) return cached;
    const match = { creatorId: new Types.ObjectId(creatorId), date: { $gte: from, $lte: to }, contentType: 'session' } as any;
    const bySession = await this.dailyModel.aggregate([
      { $match: match },
      { $group: { _id: '$contentId', views: { $sum: '$views' }, starts: { $sum: '$starts' }, completes: { $sum: '$completes' } } },
      { $project: { _id: 0, contentId: '$_id', views: 1, starts: 1, completes: 1, completionRate: { $cond: [{ $gt: ['$starts', 0] }, { $divide: ['$completes', '$starts'] }, 0] } } },
      { $sort: { views: -1 } },
    ]);
    this.setCache(key, { bySession });
    return { bySession };
  }

  async getEvents(creatorId: string, from: Date, to: Date) {
    const key = this.cacheKey(creatorId, from.toISOString(), to.toISOString(), 'events');
    const cached = this.getCache<any>(key);
    if (cached) return cached;
    const match = { creatorId: new Types.ObjectId(creatorId), date: { $gte: from, $lte: to }, contentType: 'event' } as any;
    const byEvent = await this.dailyModel.aggregate([
      { $match: match },
      { $group: { _id: '$contentId', views: { $sum: '$views' }, starts: { $sum: '$starts' }, completes: { $sum: '$completes' } } },
      { $project: { _id: 0, contentId: '$_id', views: 1, starts: 1, completes: 1 } },
      { $sort: { views: -1 } },
    ]);
    this.setCache(key, { byEvent });
    return { byEvent };
  }

  async getProducts(creatorId: string, from: Date, to: Date) {
    const key = this.cacheKey(creatorId, from.toISOString(), to.toISOString(), 'products');
    const cached = this.getCache<any>(key);
    if (cached) return cached;
    const match = { creatorId: new Types.ObjectId(creatorId), date: { $gte: from, $lte: to }, contentType: 'product' } as any;
    const byProduct = await this.dailyModel.aggregate([
      { $match: match },
      { $group: { _id: '$contentId', views: { $sum: '$views' }, likes: { $sum: '$likes' }, shares: { $sum: '$shares' }, downloads: { $sum: '$downloads' } } },
      { $project: { _id: 0, contentId: '$_id', views: 1, likes: 1, shares: 1, downloads: 1 } },
      { $sort: { views: -1 } },
    ]);
    this.setCache(key, { byProduct });
    return { byProduct };
  }

  async getPosts(creatorId: string, from: Date, to: Date) {
    const key = this.cacheKey(creatorId, from.toISOString(), to.toISOString(), 'posts');
    const cached = this.getCache<any>(key);
    if (cached) return cached;
    const match = { creatorId: new Types.ObjectId(creatorId), date: { $gte: from, $lte: to }, contentType: 'post' } as any;
    const byPost = await this.dailyModel.aggregate([
      { $match: match },
      { $group: { _id: '$contentId', views: { $sum: '$views' }, likes: { $sum: '$likes' }, shares: { $sum: '$shares' }, bookmarks: { $sum: '$bookmarks' }, ratingsCount: { $sum: '$ratingsCount' } } },
      { $project: { _id: 0, contentId: '$_id', views: 1, likes: 1, shares: 1, bookmarks: 1, ratingsCount: 1 } },
      { $sort: { views: -1 } },
    ]);
    this.setCache(key, { byPost });
    return { byPost };
  }

  // Build daily rollups for a specific creator and day (UTC boundaries)
  async rollupDayForCreator(creatorId: string, day: Date) {
    const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 0, 0, 0));
    const end = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 23, 59, 59, 999));

    const tracking = this.dbConnection.collection('trackingactions');

    // Courses
    const courseAgg = await tracking.aggregate([
      { $match: { timestamp: { $gte: start, $lte: end }, contentType: 'course' } },
      { $lookup: { from: 'cours', localField: 'contentId', foreignField: 'id', as: 'course' } },
      { $unwind: '$course' },
      { $match: { 'course.creatorId': new Types.ObjectId(creatorId) } },
      {
        $group: {
          _id: { contentId: '$contentId' },
          views: { $sum: { $cond: [{ $eq: ['$actionType', 'view'] }, 1, 0] } },
          starts: { $sum: { $cond: [{ $eq: ['$actionType', 'start'] }, 1, 0] } },
          completes: { $sum: { $cond: [{ $eq: ['$actionType', 'complete'] }, 1, 0] } },
          likes: { $sum: { $cond: [{ $eq: ['$actionType', 'like'] }, 1, 0] } },
          shares: { $sum: { $cond: [{ $eq: ['$actionType', 'share'] }, 1, 0] } },
          downloads: { $sum: { $cond: [{ $eq: ['$actionType', 'download'] }, 1, 0] } },
          bookmarks: { $sum: { $cond: [{ $eq: ['$actionType', 'bookmark'] }, 1, 0] } },
          ratingsCount: { $sum: { $cond: [{ $eq: ['$actionType', 'rate'] }, 1, 0] } },
          users: { $addToSet: '$userId' },
        },
      },
      { $project: { _id: 0, contentId: '$_id.contentId', views: 1, starts: 1, completes: 1, likes: 1, shares: 1, downloads: 1, bookmarks: 1, ratingsCount: 1, uniqueUsers: { $size: '$users' } } },
    ]).toArray();

    // Challenges
    const challengeAgg = await tracking.aggregate([
      { $match: { timestamp: { $gte: start, $lte: end }, contentType: 'challenge' } },
      { $lookup: { from: 'challenges', localField: 'contentId', foreignField: 'id', as: 'challenge' } },
      { $unwind: '$challenge' },
      { $match: { 'challenge.creatorId': new Types.ObjectId(creatorId) } },
      {
        $group: {
          _id: { contentId: '$contentId' },
          views: { $sum: { $cond: [{ $eq: ['$actionType', 'view'] }, 1, 0] } },
          starts: { $sum: { $cond: [{ $eq: ['$actionType', 'start'] }, 1, 0] } },
          completes: { $sum: { $cond: [{ $eq: ['$actionType', 'complete'] }, 1, 0] } },
          likes: { $sum: { $cond: [{ $eq: ['$actionType', 'like'] }, 1, 0] } },
          shares: { $sum: { $cond: [{ $eq: ['$actionType', 'share'] }, 1, 0] } },
          downloads: { $sum: { $cond: [{ $eq: ['$actionType', 'download'] }, 1, 0] } },
          bookmarks: { $sum: { $cond: [{ $eq: ['$actionType', 'bookmark'] }, 1, 0] } },
          ratingsCount: { $sum: { $cond: [{ $eq: ['$actionType', 'rate'] }, 1, 0] } },
          users: { $addToSet: '$userId' },
        },
      },
      { $project: { _id: 0, contentId: '$_id.contentId', views: 1, starts: 1, completes: 1, likes: 1, shares: 1, downloads: 1, bookmarks: 1, ratingsCount: 1, uniqueUsers: { $size: '$users' } } },
    ]).toArray();

    const docs: any[] = [];
    for (const c of courseAgg) docs.push({ creatorId: new Types.ObjectId(creatorId), contentType: 'course', contentId: c.contentId, communityId: c.communityId, date: start, ...c });
    for (const ch of challengeAgg) docs.push({ creatorId: new Types.ObjectId(creatorId), contentType: 'challenge', contentId: ch.contentId, communityId: ch.communityId, date: start, ...ch });
    // New types
    const sessionAgg = await tracking.aggregate([
      { $match: { timestamp: { $gte: start, $lte: end }, contentType: 'session' } },
      { $lookup: { from: 'sessions', localField: 'contentId', foreignField: 'id', as: 'session' } },
      { $unwind: '$session' },
      { $match: { 'session.creatorId': new Types.ObjectId(creatorId) } },
      { $group: { _id: { contentId: '$contentId' }, views: { $sum: { $cond: [{ $eq: ['$actionType', 'view'] }, 1, 0] } }, starts: { $sum: { $cond: [{ $eq: ['$actionType', 'start'] }, 1, 0] } }, completes: { $sum: { $cond: [{ $eq: ['$actionType', 'complete'] }, 1, 0] } }, users: { $addToSet: '$userId' }, communityId: { $first: '$session.communityId' } } },
      { $project: { _id: 0, contentId: '$_id.contentId', views: 1, starts: 1, completes: 1, uniqueUsers: { $size: '$users' }, communityId: 1 } },
    ]).toArray();
    for (const s of sessionAgg) docs.push({ creatorId: new Types.ObjectId(creatorId), contentType: 'session', contentId: s.contentId, communityId: s.communityId, date: start, ...s });

    const eventAgg = await tracking.aggregate([
      { $match: { timestamp: { $gte: start, $lte: end }, contentType: 'event' } },
      { $lookup: { from: 'events', localField: 'contentId', foreignField: 'id', as: 'event' } },
      { $unwind: '$event' },
      { $match: { 'event.creatorId': new Types.ObjectId(creatorId) } },
      { $group: { _id: { contentId: '$contentId' }, views: { $sum: { $cond: [{ $eq: ['$actionType', 'view'] }, 1, 0] } }, starts: { $sum: { $cond: [{ $eq: ['$actionType', 'start'] }, 1, 0] } }, completes: { $sum: { $cond: [{ $eq: ['$actionType', 'complete'] }, 1, 0] } }, users: { $addToSet: '$userId' }, communityId: { $first: '$event.communityId' } } },
      { $project: { _id: 0, contentId: '$_id.contentId', views: 1, starts: 1, completes: 1, uniqueUsers: { $size: '$users' }, communityId: 1 } },
    ]).toArray();
    for (const e of eventAgg) docs.push({ creatorId: new Types.ObjectId(creatorId), contentType: 'event', contentId: e.contentId, communityId: e.communityId, date: start, ...e });

    const productAgg = await tracking.aggregate([
      { $match: { timestamp: { $gte: start, $lte: end }, contentType: 'product' } },
      { $lookup: { from: 'products', localField: 'contentId', foreignField: 'id', as: 'product' } },
      { $unwind: '$product' },
      { $match: { 'product.creatorId': new Types.ObjectId(creatorId) } },
      { $group: { _id: { contentId: '$contentId' }, views: { $sum: { $cond: [{ $eq: ['$actionType', 'view'] }, 1, 0] } }, likes: { $sum: { $cond: [{ $eq: ['$actionType', 'like'] }, 1, 0] } }, shares: { $sum: { $cond: [{ $eq: ['$actionType', 'share'] }, 1, 0] } }, downloads: { $sum: { $cond: [{ $eq: ['$actionType', 'download'] }, 1, 0] } }, users: { $addToSet: '$userId' }, communityId: { $first: '$product.communityId' } } },
      { $project: { _id: 0, contentId: '$_id.contentId', views: 1, likes: 1, shares: 1, downloads: 1, uniqueUsers: { $size: '$users' }, communityId: 1 } },
    ]).toArray();
    for (const p of productAgg) docs.push({ creatorId: new Types.ObjectId(creatorId), contentType: 'product', contentId: p.contentId, communityId: p.communityId, date: start, ...p });

    const postAgg = await tracking.aggregate([
      { $match: { timestamp: { $gte: start, $lte: end }, contentType: 'post' } },
      { $lookup: { from: 'posts', localField: 'contentId', foreignField: 'id', as: 'post' } },
      { $unwind: '$post' },
      { $match: { 'post.creatorId': new Types.ObjectId(creatorId) } },
      { $group: { _id: { contentId: '$contentId' }, views: { $sum: { $cond: [{ $eq: ['$actionType', 'view'] }, 1, 0] } }, likes: { $sum: { $cond: [{ $eq: ['$actionType', 'like'] }, 1, 0] } }, shares: { $sum: { $cond: [{ $eq: ['$actionType', 'share'] }, 1, 0] } }, bookmarks: { $sum: { $cond: [{ $eq: ['$actionType', 'bookmark'] }, 1, 0] } }, ratingsCount: { $sum: { $cond: [{ $eq: ['$actionType', 'rate'] }, 1, 0] } }, users: { $addToSet: '$userId' }, communityId: { $first: '$post.communityId' } } },
      { $project: { _id: 0, contentId: '$_id.contentId', views: 1, likes: 1, shares: 1, bookmarks: 1, ratingsCount: 1, uniqueUsers: { $size: '$users' }, communityId: 1 } },
    ]).toArray();
    for (const po of postAgg) docs.push({ creatorId: new Types.ObjectId(creatorId), contentType: 'post', contentId: po.contentId, communityId: po.communityId, date: start, ...po });

    for (const d of docs) {
      await this.dailyModel.updateOne(
        { creatorId: d.creatorId, contentType: d.contentType, contentId: d.contentId, date: d.date },
        { $set: d },
        { upsert: true },
      );
    }
    this.cache.clear();
    return { updated: docs.length, date: start.toISOString() };
  }

  async backfillForCreator(creatorId: string, days: number = 90) {
    const today = new Date();
    let count = 0;
    for (let i = days; i >= 0; i--) {
      const day = new Date(today.getTime() - i * 24 * 3600 * 1000);
      const r = await this.rollupDayForCreator(creatorId, day);
      count += r.updated;
    }
    return { ok: true, updated: count };
  }

  async getDevices(creatorId: string, from: Date, to: Date) {
    const key = this.cacheKey(creatorId, from.toISOString(), to.toISOString(), 'devices');
    const cached = this.getCache<any>(key);
    if (cached) return cached;
    const tracking = this.dbConnection.collection('trackingactions');
    const rows = await tracking.aggregate([
      { $match: { timestamp: { $gte: from, $lte: to } } },
      { $lookup: { from: 'cours', localField: 'contentId', foreignField: 'id', as: 'course' } },
      { $lookup: { from: 'challenges', localField: 'contentId', foreignField: 'id', as: 'challenge' } },
      { $addFields: { contentDoc: { $ifNull: [{ $arrayElemAt: ['$course', 0] }, { $arrayElemAt: ['$challenge', 0] }] } } },
      { $match: { 'contentDoc.creatorId': new Types.ObjectId(creatorId) } },
      { $project: { device: '$metadata.device', os: '$metadata.os', browser: '$metadata.browser' } },
      { $group: { _id: { device: '$device', os: '$os', browser: '$browser' }, count: { $sum: 1 } } },
      { $project: { _id: 0, device: '$_id.device', os: '$_id.os', browser: '$_id.browser', count: 1 } },
      { $sort: { count: -1 } },
    ]).toArray();
    this.setCache(key, { rows });
    return { rows };
  }

  async getReferrers(creatorId: string, from: Date, to: Date) {
    const key = this.cacheKey(creatorId, from.toISOString(), to.toISOString(), 'referrers');
    const cached = this.getCache<any>(key);
    if (cached) return cached;
    const tracking = this.dbConnection.collection('trackingactions');
    const rows = await tracking.aggregate([
      { $match: { timestamp: { $gte: from, $lte: to } } },
      { $lookup: { from: 'cours', localField: 'contentId', foreignField: 'id', as: 'course' } },
      { $lookup: { from: 'challenges', localField: 'contentId', foreignField: 'id', as: 'challenge' } },
      { $addFields: { contentDoc: { $ifNull: [{ $arrayElemAt: ['$course', 0] }, { $arrayElemAt: ['$challenge', 0] }] } } },
      { $match: { 'contentDoc.creatorId': new Types.ObjectId(creatorId) } },
      { $project: { referrer: '$metadata.referrer', utm_source: '$metadata.utm_source', utm_medium: '$metadata.utm_medium', utm_campaign: '$metadata.utm_campaign' } },
      { $group: { _id: { referrer: '$referrer', utm_source: '$utm_source', utm_medium: '$utm_medium', utm_campaign: '$utm_campaign' }, count: { $sum: 1 } } },
      { $project: { _id: 0, referrer: '$_id.referrer', utm_source: '$_id.utm_source', utm_medium: '$_id.utm_medium', utm_campaign: '$_id.utm_campaign', count: 1 } },
      { $sort: { count: -1 } },
      { $limit: 50 },
    ]).toArray();
    this.setCache(key, { rows });
    return { rows };
  }

  async exportCsv(creatorId: string, scope: 'overview'|'courses'|'challenges'|'sessions'|'events'|'products'|'posts', from: Date, to: Date) {
    // Determine plan and restrict to pro only
    const sub = await this.subscriptionService.getMySubscription(creatorId);
    const plan = (sub?.plan as PlanTier) || PlanTier.STARTER;
    if (plan !== PlanTier.PRO) {
      return { success: false, message: 'CSV export available for PRO plan only' };
    }

    if (scope === 'overview') {
      const data = await this.getOverview(creatorId, from, to, PlanTier.PRO);
      const rows = [
        ['metric','value'],
        ['views', data.totals.views],
        ['starts', data.totals.starts],
        ['completes', data.totals.completes],
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
      const res = await this.getCourses(creatorId, from, to);
      const head = ['contentId','views','starts','completes','completionRate','watchTime','ratingsCount'];
      const rows = [head, ...res.byCourse.map((c: any) => [c.contentId, c.views, c.starts, c.completes, c.completionRate, c.watchTime, c.ratingsCount])];
      return { filename: 'courses.csv', csv: this.toCsv(rows) };
    }

    if (scope === 'challenges') {
      const res = await this.getChallenges(creatorId, from, to);
      const head = ['contentId','views','starts','completes','completionRate'];
      const rows = [head, ...res.byChallenge.map((c: any) => [c.contentId, c.views, c.starts, c.completes, c.completionRate])];
      return { filename: 'challenges.csv', csv: this.toCsv(rows) };
    }

    if (scope === 'sessions') {
      const res = await this.getSessions(creatorId, from, to);
      const head = ['contentId','views','starts','completes','completionRate'];
      const rows = [head, ...res.bySession.map((c: any) => [c.contentId, c.views, c.starts, c.completes, c.completionRate])];
      return { filename: 'sessions.csv', csv: this.toCsv(rows) };
    }

    if (scope === 'events') {
      const res = await this.getEvents(creatorId, from, to);
      const head = ['contentId','views','starts','completes'];
      const rows = [head, ...res.byEvent.map((c: any) => [c.contentId, c.views, c.starts, c.completes])];
      return { filename: 'events.csv', csv: this.toCsv(rows) };
    }

    if (scope === 'products') {
      const res = await this.getProducts(creatorId, from, to);
      const head = ['contentId','views','likes','shares','downloads'];
      const rows = [head, ...res.byProduct.map((c: any) => [c.contentId, c.views, c.likes, c.shares, c.downloads])];
      return { filename: 'products.csv', csv: this.toCsv(rows) };
    }

    // posts
    const res = await this.getPosts(creatorId, from, to);
    const head = ['contentId','views','likes','shares','bookmarks','ratingsCount'];
    const rows = [head, ...res.byPost.map((c: any) => [c.contentId, c.views, c.likes, c.shares, c.bookmarks, c.ratingsCount])];
    return { filename: 'posts.csv', csv: this.toCsv(rows) };
  }

  private toCsv(rows: (string|number)[][]) {
    return rows.map(r => r.map(v => (v === null || v === undefined) ? '' : String(v).replace(/"/g, '""')).map(v => /[",\n]/.test(v) ? `"${v}"` : v).join(',')).join('\n');
  }

  private shapeOverview(full: any, plan: PlanTier) {
    const baseData = {
      totals: full.totals,
      revenue: full.revenue,
      avgEngagement: full.engagementRate,
      engagementRate: full.engagementRate,
    };

    if (plan === 'starter') {
      return {
        ...baseData,
        trend7d: full.trend.slice(-7),
        topContents: full.topContents,
      };
    }
    if (plan === 'growth') {
      return {
        ...baseData,
        trend7d: full.trend.slice(-7),
        trend28d: full.trend.slice(-28),
        topContents: full.topContents,
      };
    }
    // pro
    return {
      ...baseData,
      trend7d: full.trend.slice(-7),
      trend28d: full.trend.slice(-28),
      trendAll: full.trend,
      topContents: full.topContents,
    };
  }

  async getCourseAnalytics(creatorId: string, courseId: string, from: Date, to: Date) {
    const key = this.cacheKey(creatorId, `${courseId}:${from.toISOString()}`, to.toISOString(), 'course');
    const cached = this.getCache<any>(key);
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
        $group: {
          _id: '$actionType',
          count: { $sum: 1 },
          uniqueUsers: { $size: '$users' },
          communityId: '$course.communityId'
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

    // Get daily trend for this course
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
      views: courseTracking.find(t => t._id === 'view')?.count || 0,
      starts: courseTracking.find(t => t._id === 'start')?.count || 0,
      completes: courseTracking.find(t => t._id === 'complete')?.count || 0,
      completionRate: Math.round(completionRate * 100) / 100,
      dailyTrend: dailyTrend,
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
}
