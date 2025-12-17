import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ContentTrackingService } from '../common/services/content-tracking.service';
import { TrackableContentType } from '../schema/content-tracking.schema';
import { Cours } from '../schema/course.schema';
import { Challenge } from '../schema/challenge.schema';
import { Session } from '../schema/session.schema';
import { Event } from '../schema/event.schema';
import { Product } from '../schema/product.schema';
import { Post } from '../schema/post.schema';
import { Community } from '../schema/community.schema';
import {
  ProgressionItemDto,
  ProgressionOverviewDto,
  ProgressionSummaryDto,
  ProgressionSummaryByTypeDto,
} from './dto/progression-item.dto';
import { GetProgressionOverviewDto } from './dto/get-progression-overview.dto';

const SUPPORTED_TRACKABLE_TYPES: TrackableContentType[] = [
  TrackableContentType.COURSE,
  TrackableContentType.CHALLENGE,
  TrackableContentType.SESSION,
  TrackableContentType.EVENT,
  TrackableContentType.PRODUCT,
  TrackableContentType.POST,
];

type ContentProgressRecord = {
  id: string;
  userId: Types.ObjectId;
  contentId: string;
  contentType: TrackableContentType;
  isCompleted: boolean;
  watchTime?: number;
  lastAccessedAt?: Date;
  completedAt?: Date;
  metadata?: Record<string, any>;
  viewCount?: number;
  likeCount?: number;
  shareCount?: number;
  downloadCount?: number;
  createdAt?: Date;
  updatedAt?: Date;
};

interface ContentDetails {
  id: string;
  title?: string;
  description?: string;
  thumbnail?: string;
  communityId?: string;
  meta?: Record<string, any>;
}

@Injectable()
export class ProgressionService {
  constructor(
    private readonly trackingService: ContentTrackingService,
    @InjectModel('Cours') private readonly courseModel: Model<Cours>,
    @InjectModel('Challenge') private readonly challengeModel: Model<Challenge>,
    @InjectModel('Session') private readonly sessionModel: Model<Session>,
    @InjectModel('Event') private readonly eventModel: Model<Event>,
    @InjectModel('Product') private readonly productModel: Model<Product>,
    @InjectModel('Post') private readonly postModel: Model<Post>,
    @InjectModel(Community.name) private readonly communityModel: Model<Community>,
  ) {}

  async getUserProgressOverview(
    userId: string,
    query: GetProgressionOverviewDto,
  ): Promise<ProgressionOverviewDto> {
    const { page, limit } = query;
    const requestedTypes = this.parseContentTypes(query.contentTypes);

    if (query.contentTypes && requestedTypes.length === 0) {
      return this.buildEmptyOverview(page, limit);
    }

    let resolvedCommunityId: string | undefined;
    const { communityId, communitySlug } = query;

    if (communityId || communitySlug) {
      resolvedCommunityId = await this.resolveCommunityId(communityId, communitySlug);
    }

    let effectiveTypes =
      requestedTypes.length > 0 ? requestedTypes : SUPPORTED_TRACKABLE_TYPES;

    let contentFilters: Partial<Record<TrackableContentType, string[]>> | undefined;

    if (resolvedCommunityId) {
      contentFilters = await this.buildContentFiltersForCommunity(resolvedCommunityId, effectiveTypes);
      const typesWithContent = new Set(Object.keys(contentFilters) as TrackableContentType[]);
      effectiveTypes = effectiveTypes.filter((type) => typesWithContent.has(type));

      if (effectiveTypes.length === 0) {
        return this.buildEmptyOverview(page, limit);
      }
    }

    const overview = await this.trackingService.getUserProgressOverview(
      userId,
      effectiveTypes,
      page,
      limit,
      contentFilters,
    );

    const items = overview.items as ContentProgressRecord[];
    if (items.length === 0) {
      return this.buildEmptyOverview(page, limit);
    }

    const detailsMap = await this.hydrateContentDetails(items);
    const communitiesMap = await this.hydrateCommunities(Array.from(detailsMap.values()));

    const progressionItems = items.map((progress) => {
      const key = this.buildDetailsKey(progress.contentType, progress.contentId);
      const details = detailsMap.get(key);
      const community =
        details?.communityId && communitiesMap.has(details.communityId)
          ? communitiesMap.get(details.communityId)
          : undefined;

      return this.buildProgressionItem(progress, details, community);
    });

    const summary = this.buildSummary(progressionItems);

    return {
      summary,
      pagination: {
        page,
        limit,
        total: overview.total,
        totalPages: overview.totalPages,
      },
      items: progressionItems,
    };
  }

  private parseContentTypes(raw?: string): TrackableContentType[] {
    if (!raw) {
      return [];
    }

    const allowed = new Set(SUPPORTED_TRACKABLE_TYPES);
    return raw
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .map((value) => value.toLowerCase() as TrackableContentType)
      .filter((value) => allowed.has(value));
  }

  private buildEmptyOverview(page: number, limit: number): ProgressionOverviewDto {
    return {
      summary: this.buildSummary([]),
      pagination: {
        page,
        limit,
        total: 0,
        totalPages: 0,
      },
      items: [],
    };
  }

  private async resolveCommunityId(communityId?: string, communitySlug?: string): Promise<string> {
    if (communityId) {
      let community;
      if (Types.ObjectId.isValid(communityId)) {
        community = await this.communityModel.findById(communityId).select('_id').lean();
      } else {
        community = await this.communityModel.findOne({ id: communityId }).select('_id').lean();
      }
      if (!community) {
        throw new NotFoundException('Community not found');
      }
      return community._id.toString();
    }

    if (communitySlug) {
      const community = await this.communityModel.findOne({ slug: communitySlug }).select('_id').lean();
      if (!community) {
        throw new NotFoundException('Community not found');
      }
      return community._id.toString();
    }

    throw new BadRequestException('communityId or communitySlug is required');
  }

  private async buildContentFiltersForCommunity(
    communityId: string,
    contentTypes: TrackableContentType[],
  ): Promise<Partial<Record<TrackableContentType, string[]>>> {
    const filters: Partial<Record<TrackableContentType, string[]>> = {};
    const typeSet = new Set(contentTypes);
    const communityObjectId = new Types.ObjectId(communityId);
    const tasks: Promise<void>[] = [];

    if (typeSet.has(TrackableContentType.COURSE)) {
      tasks.push(
        this.courseModel
          .find({ communityId: communityObjectId })
          .select('id')
          .lean()
          .then((docs) => {
            const ids = docs.map((doc) => doc.id);
            if (ids.length) {
              filters[TrackableContentType.COURSE] = ids;
            }
          }),
      );
    }

    if (typeSet.has(TrackableContentType.CHALLENGE)) {
      tasks.push(
        this.challengeModel
          .find({ communityId: communityObjectId })
          .select('id')
          .lean()
          .then((docs) => {
            const ids = docs.map((doc) => doc.id);
            if (ids.length) {
              filters[TrackableContentType.CHALLENGE] = ids;
            }
          }),
      );
    }

    if (typeSet.has(TrackableContentType.SESSION)) {
      tasks.push(
        this.sessionModel
          .find({ communityId: communityObjectId })
          .select('id')
          .lean()
          .then((docs) => {
            const ids = docs.map((doc) => doc.id);
            if (ids.length) {
              filters[TrackableContentType.SESSION] = ids;
            }
          }),
      );
    }

    if (typeSet.has(TrackableContentType.EVENT)) {
      tasks.push(
        this.eventModel
          .find({ communityId: communityObjectId })
          .select('id')
          .lean()
          .then((docs) => {
            const ids = docs.map((doc) => doc.id);
            if (ids.length) {
              filters[TrackableContentType.EVENT] = ids;
            }
          }),
      );
    }

    if (typeSet.has(TrackableContentType.PRODUCT)) {
      tasks.push(
        this.productModel
          .find({ communityId: communityObjectId })
          .select('id')
          .lean()
          .then((docs) => {
            const ids = docs.map((doc) => doc.id);
            if (ids.length) {
              filters[TrackableContentType.PRODUCT] = ids;
            }
          }),
      );
    }

    if (typeSet.has(TrackableContentType.POST)) {
      tasks.push(
        this.postModel
          .find({ communityId: communityObjectId })
          .select('id')
          .lean()
          .then((docs) => {
            const ids = docs.map((doc) => doc.id);
            if (ids.length) {
              filters[TrackableContentType.POST] = ids;
            }
          }),
      );
    }

    await Promise.all(tasks);

    return filters;
  }

  private async hydrateContentDetails(
    items: ContentProgressRecord[],
  ): Promise<Map<string, ContentDetails>> {
    const grouped: Record<TrackableContentType, string[]> = {
      [TrackableContentType.COURSE]: [],
      [TrackableContentType.CHALLENGE]: [],
      [TrackableContentType.SESSION]: [],
      [TrackableContentType.POST]: [],
      [TrackableContentType.EVENT]: [],
      [TrackableContentType.PRODUCT]: [],
      [TrackableContentType.RESOURCE]: [],
      [TrackableContentType.COMMUNITY]: [],
      [TrackableContentType.SUBSCRIPTION]: [],
    };

    for (const item of items) {
      if (grouped[item.contentType]) {
        grouped[item.contentType].push(item.contentId);
      }
    }

    const detailMap = new Map<string, ContentDetails>();

    const [
      courses,
      challenges,
      sessions,
      events,
      products,
      posts,
    ] = await Promise.all([
      this.fetchCourses(grouped[TrackableContentType.COURSE]),
      this.fetchChallenges(grouped[TrackableContentType.CHALLENGE]),
      this.fetchSessions(grouped[TrackableContentType.SESSION]),
      this.fetchEvents(grouped[TrackableContentType.EVENT]),
      this.fetchProducts(grouped[TrackableContentType.PRODUCT]),
      this.fetchPosts(grouped[TrackableContentType.POST]),
    ]);

    this.mergeDetails(detailMap, TrackableContentType.COURSE, courses);
    this.mergeDetails(detailMap, TrackableContentType.CHALLENGE, challenges);
    this.mergeDetails(detailMap, TrackableContentType.SESSION, sessions);
    this.mergeDetails(detailMap, TrackableContentType.EVENT, events);
    this.mergeDetails(detailMap, TrackableContentType.PRODUCT, products);
    this.mergeDetails(detailMap, TrackableContentType.POST, posts);

    return detailMap;
  }

  private mergeDetails(
    map: Map<string, ContentDetails>,
    type: TrackableContentType,
    entries: Map<string, ContentDetails>,
  ) {
    entries.forEach((value, key) => {
      map.set(this.buildDetailsKey(type, key), value);
    });
  }

  private buildDetailsKey(type: TrackableContentType, id: string): string {
    return `${type}:${id}`;
  }

  private async fetchCourses(ids: string[]): Promise<Map<string, ContentDetails>> {
    if (!ids.length) {
      return new Map();
    }

    const docs = await this.courseModel
      .find({ id: { $in: ids } })
      .select('id titre description thumbnail communityId category niveau prix')
      .lean()
      .exec();

    return new Map(
      docs.map((doc) => [
        doc.id,
        {
          id: doc.id,
          title: doc.titre,
          description: doc.description,
          thumbnail: doc.thumbnail,
          communityId: doc.communityId,
          meta: {
            category: doc.category,
            level: doc.niveau,
            price: doc.prix,
            type: 'course',
          },
        },
      ]),
    );
  }

  private async fetchChallenges(ids: string[]): Promise<Map<string, ContentDetails>> {
    if (!ids.length) {
      return new Map();
    }

    const docs = await this.challengeModel
      .find({ id: { $in: ids } })
      .select('id title description thumbnail communityId category difficulty startDate endDate participants')
      .lean()
      .exec();

    return new Map(
      docs.map((doc) => [
        doc.id,
        {
          id: doc.id,
          title: doc.title,
          description: doc.description,
          thumbnail: doc.thumbnail,
          communityId: doc.communityId?.toString(),
          meta: {
            category: doc.category,
            difficulty: doc.difficulty,
            startDate: doc.startDate,
            endDate: doc.endDate,
            participants: doc.participants?.length ?? 0,
            type: 'challenge',
          },
        },
      ]),
    );
  }

  private async fetchSessions(ids: string[]): Promise<Map<string, ContentDetails>> {
    if (!ids.length) {
      return new Map();
    }

    const docs = await this.sessionModel
      .find({ id: { $in: ids } })
      .select('id title description communityId duration price category isActive')
      .lean()
      .exec();

    return new Map(
      docs.map((doc) => [
        doc.id,
        {
          id: doc.id,
          title: doc.title,
          description: doc.description,
          thumbnail: undefined,
          communityId: doc.communityId,
          meta: {
            duration: doc.duration,
            price: doc.price,
            category: doc.category,
            isActive: doc.isActive,
            type: 'session',
          },
        },
      ]),
    );
  }

  private async fetchEvents(ids: string[]): Promise<Map<string, ContentDetails>> {
    if (!ids.length) {
      return new Map();
    }

    const docs = await this.eventModel
      .find({ id: { $in: ids } })
      .select('id title description image communityId startDate endDate category type totalAttendees totalRevenue')
      .lean()
      .exec();

    return new Map(
      docs.map((doc) => [
        doc.id,
        {
          id: doc.id,
          title: doc.title,
          description: doc.description,
          thumbnail: doc.image ?? undefined,
          communityId: doc.communityId?.toString(),
          meta: {
            startDate: doc.startDate,
            endDate: doc.endDate,
            category: doc.category,
            eventType: doc.type,
            attendees: doc.totalAttendees,
            revenue: doc.totalRevenue,
            type: 'event',
          },
        },
      ]),
    );
  }

  private async fetchProducts(ids: string[]): Promise<Map<string, ContentDetails>> {
    if (!ids.length) {
      return new Map();
    }

    const docs = await this.productModel
      .find({ id: { $in: ids } })
      .select('id title description images communityId price type category sales')
      .lean()
      .exec();

    return new Map(
      docs.map((doc) => [
        doc.id,
        {
          id: doc.id,
          title: doc.title,
          description: doc.description,
          thumbnail: doc.images?.[0],
          communityId: doc.communityId,
          meta: {
            price: doc.price,
            productType: doc.type,
            category: doc.category,
            sales: doc.sales,
            type: 'product',
          },
        },
      ]),
    );
  }

  private async fetchPosts(ids: string[]): Promise<Map<string, ContentDetails>> {
    if (!ids.length) {
      return new Map();
    }

    const docs = await this.postModel
      .find({ id: { $in: ids } })
      .select('id title excerpt thumbnail communityId tags likes')
      .lean()
      .exec();

    return new Map(
      docs.map((doc) => [
        doc.id,
        {
          id: doc.id,
          title: doc.title,
          description: doc.excerpt,
          thumbnail: doc.thumbnail,
          communityId: doc.communityId,
          meta: {
            tags: doc.tags,
            likes: doc.likes,
            type: 'post',
          },
        },
      ]),
    );
  }

  private async hydrateCommunities(details: ContentDetails[]) {
    const communityIds = Array.from(
      new Set(details.map((detail) => detail.communityId).filter((id): id is string => Boolean(id))),
    );

    if (!communityIds.length) {
      return new Map<string, Community>();
    }

    const objectIds = communityIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    if (!objectIds.length) {
      return new Map<string, Community>();
    }

    const docs = await this.communityModel
      .find({ _id: { $in: objectIds } })
      .select('_id name slug')
      .lean()
      .exec();

    return new Map(docs.map((doc) => [doc._id.toString(), doc]));
  }

  private buildProgressionItem(
    progress: ContentProgressRecord,
    details?: ContentDetails,
    community?: Community,
  ): ProgressionItemDto {
    const status = this.resolveStatus(progress);
    const progressPercent = this.resolveProgressPercent(progress);
    const baseMeta = details?.meta ?? {};

    return {
      contentId: progress.contentId,
      contentType: progress.contentType,
      title: details?.title ?? `Content ${progress.contentId}`,
      description: details?.description,
      thumbnail: details?.thumbnail,
      status,
      progressPercent,
      lastAccessedAt: progress.lastAccessedAt,
      completedAt: progress.completedAt,
      community: community
        ? {
            id: community._id?.toString(),
            name: (community as any).name,
            slug: (community as any).slug,
          }
        : undefined,
      meta: {
        ...baseMeta,
        watchTime: progress.watchTime,
        viewCount: progress.viewCount,
        likeCount: progress.likeCount,
        shareCount: progress.shareCount,
        downloadCount: progress.downloadCount,
        updatedAt: progress.updatedAt,
      },
      actions: this.buildActions(progress.contentType, progress.contentId, community, details),
    };
  }

  private resolveStatus(progress: ContentProgressRecord): 'not_started' | 'in_progress' | 'completed' {
    if (progress.isCompleted) {
      return 'completed';
    }

    const hasActivity =
      (progress.watchTime ?? 0) > 0 ||
      (progress.viewCount ?? 0) > 0 ||
      (progress.likeCount ?? 0) > 0 ||
      (progress.metadata && progress.metadata['progressPercent']);

    return hasActivity ? 'in_progress' : 'not_started';
  }

  private resolveProgressPercent(progress: ContentProgressRecord): number | undefined {
    if (progress.metadata && typeof progress.metadata['progressPercent'] === 'number') {
      return progress.metadata['progressPercent'];
    }

    if (progress.isCompleted) {
      return 100;
    }

    return undefined;
  }

  private buildActions(
    type: TrackableContentType,
    contentId: string,
    community?: Community,
    details?: ContentDetails,
  ) {
    const slug = community?.slug || details?.meta?.communitySlug || details?.communityId;
    const basePath = slug ? `/community/${slug}` : '';

    const mappings: Record<TrackableContentType, string> = {
      [TrackableContentType.COURSE]: `${basePath}/courses/${contentId}`,
      [TrackableContentType.CHALLENGE]: `${basePath}/challenges/${contentId}`,
      [TrackableContentType.SESSION]: `${basePath}/sessions/${contentId}`,
      [TrackableContentType.EVENT]: `${basePath}/events/${contentId}`,
      [TrackableContentType.PRODUCT]: `${basePath}/products/${contentId}`,
      [TrackableContentType.POST]: `${basePath}/feed/${contentId}`,
      [TrackableContentType.RESOURCE]: `${basePath}/resources/${contentId}`,
      [TrackableContentType.COMMUNITY]: `/community/${community?.slug ?? contentId}`,
      [TrackableContentType.SUBSCRIPTION]: `/subscriptions/${contentId}`,
    };

    const view = mappings[type] ?? `/content/${type}/${contentId}`;

    return {
      view,
      continue: view,
    };
  }

  private buildSummary(items: ProgressionItemDto[]): ProgressionSummaryDto {
    const summaryByType: Record<string, ProgressionSummaryByTypeDto> = {};

    let completed = 0;
    let inProgress = 0;
    let notStarted = 0;

    for (const item of items) {
      if (!summaryByType[item.contentType]) {
        summaryByType[item.contentType] = { total: 0, completed: 0 };
      }

      summaryByType[item.contentType].total += 1;
      if (item.status === 'completed') {
        summaryByType[item.contentType].completed += 1;
        completed += 1;
      } else if (item.status === 'in_progress') {
        inProgress += 1;
      } else {
        notStarted += 1;
      }
    }

    return {
      totalItems: items.length,
      completed,
      inProgress,
      notStarted,
      byType: summaryByType,
    };
  }
}

