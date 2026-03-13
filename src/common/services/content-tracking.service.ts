import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ContentProgress,
  ContentProgressDocument,
  TrackingAction,
  TrackingActionDocument,
  TrackableContentType,
  TrackingActionType,
} from '../../schema/content-tracking.schema';
import { Cours, CoursDocument } from '../../schema/course.schema';
import { Challenge, ChallengeDocument } from '../../schema/challenge.schema';
import { Session, SessionDocument } from '../../schema/session.schema';
import { Event, EventDocument } from '../../schema/event.schema';
import { Product, ProductDocument } from '../../schema/product.schema';
import { Post, PostDocument } from '../../schema/post.schema';
import { Ga4Service } from '../../ga4/ga4.service';
import { applyWatchTimePolicy } from '../utils/watch-time-policy.util';

@Injectable()
export class ContentTrackingService {
  constructor(
    @InjectModel('ContentProgress')
    private contentProgressModel: Model<ContentProgressDocument>,
    @InjectModel('TrackingAction')
    private trackingActionModel: Model<TrackingActionDocument>,
    @InjectModel(Cours.name) private courseModel: Model<CoursDocument>,
    @InjectModel(Challenge.name) private challengeModel: Model<ChallengeDocument>,
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
    @InjectModel(Event.name) private eventModel: Model<EventDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(Post.name) private postModel: Model<PostDocument>,
    private readonly ga4Service: Ga4Service,
  ) {}

  private async findContentDocumentById(
    model: Model<any>,
    contentId: string,
    select: string,
  ): Promise<any | null> {
    let doc: any | null = null;

    if (Types.ObjectId.isValid(contentId)) {
      doc = await model.findById(contentId).select(select).lean();
    }

    if (!doc) {
      doc = await model.findOne({ id: contentId }).select(select).lean();
    }

    return doc;
  }

  private normalizeMetadata(metadata: Record<string, any> = {}): Record<string, any> {
    if (!metadata || typeof metadata !== 'object') return {};

    const normalized: Record<string, any> = { ...metadata };

    const userAgent: string | undefined =
      typeof normalized.userAgent === 'string'
        ? normalized.userAgent
        : typeof normalized.ua === 'string'
          ? normalized.ua
          : undefined;

    if (userAgent && typeof normalized.userAgent !== 'string') {
      normalized.userAgent = userAgent;
    }

    const ua = userAgent?.toLowerCase() || '';

    if (!normalized.device || typeof normalized.device !== 'string') {
      let device = 'desktop';
      const isTablet =
        ua.includes('tablet') ||
        ua.includes('ipad') ||
        ua.includes('playbook') ||
        ua.includes('silk') ||
        (ua.includes('android') && !ua.includes('mobile'));
      const isMobile =
        ua.includes('mobi') ||
        ua.includes('iphone') ||
        ua.includes('ipod') ||
        ua.includes('iemobile') ||
        ua.includes('blackberry') ||
        ua.includes('kindle') ||
        ua.includes('opera mini') ||
        ua.includes('windows phone') ||
        ua.includes('android');

      if (isTablet) device = 'tablet';
      else if (isMobile) device = 'mobile';

      normalized.device = device;
    }

    if ((!normalized.os || typeof normalized.os !== 'string') && ua) {
      let os = 'unknown';
      if (ua.includes('windows')) os = 'Windows';
      else if (ua.includes('android')) os = 'Android';
      else if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod') || ua.includes('like mac os x')) os = 'iOS';
      else if (ua.includes('mac os x') || ua.includes('macintosh')) os = 'MacOS';
      else if (ua.includes('linux')) os = 'Linux';
      normalized.os = os;
    }

    if ((!normalized.browser || typeof normalized.browser !== 'string') && ua) {
      let browser = 'unknown';
      if (ua.includes('firefox') || ua.includes('fxios')) browser = 'Firefox';
      else if (ua.includes('samsungbrowser')) browser = 'Samsung Browser';
      else if (ua.includes('opr/') || ua.includes('opera')) browser = 'Opera';
      else if (ua.includes('edg/')) browser = 'Edge';
      else if (ua.includes('chrome') || ua.includes('crios')) browser = 'Chrome';
      else if (ua.includes('safari')) browser = 'Safari';
      normalized.browser = browser;
    }

    return normalized;
  }

  private async getContentContext(contentId: string, contentType: TrackableContentType): Promise<{ creatorId?: string, communityId?: string }> {
    try {
      let doc: any = null;
      switch (contentType) {
        case TrackableContentType.COURSE:
          doc = await this.findContentDocumentById(this.courseModel, contentId, 'creatorId communityId');
          break;
        case TrackableContentType.CHALLENGE:
          doc = await this.findContentDocumentById(this.challengeModel, contentId, 'creatorId communityId');
          break;
        case TrackableContentType.SESSION:
          doc = await this.findContentDocumentById(this.sessionModel, contentId, 'creatorId communityId');
          break;
        case TrackableContentType.EVENT:
          doc = await this.findContentDocumentById(this.eventModel, contentId, 'creatorId communityId');
          break;
        case TrackableContentType.PRODUCT:
          doc = await this.findContentDocumentById(this.productModel, contentId, 'creatorId communityId');
          break;
        case TrackableContentType.POST:
          doc = await this.findContentDocumentById(this.postModel, contentId, 'authorId communityId');
          if (doc) {
             return { creatorId: doc.authorId?.toString(), communityId: doc.communityId?.toString() };
          }
          break;
      }

      if (doc) {
        return { 
          creatorId: doc.creatorId?.toString(), 
          communityId: doc.communityId?.toString() 
        };
      }
    } catch (err) {
      console.warn(`[ContentTracking] Failed to load context for ${contentType} ${contentId}`, err);
    }
    return {};
  }

  private async getContentDetails(contentId: string, contentType: TrackableContentType): Promise<any> {
    try {
      let doc: any = null;
      switch (contentType) {
        case TrackableContentType.COURSE:
          doc = await this.findContentDocumentById(this.courseModel, contentId, 'titre slug thumbnail');
          return doc ? { title: doc.titre, slug: doc.slug, thumbnail: doc.thumbnail } : null;
        case TrackableContentType.CHALLENGE:
          doc = await this.findContentDocumentById(this.challengeModel, contentId, 'title slug thumbnail');
          return doc ? { title: doc.title, slug: doc.slug, thumbnail: doc.thumbnail } : null;
        case TrackableContentType.SESSION:
          doc = await this.findContentDocumentById(this.sessionModel, contentId, 'title slug thumbnail');
          return doc ? { title: doc.title, slug: doc.slug, thumbnail: doc.thumbnail } : null;
        case TrackableContentType.EVENT:
          doc = await this.findContentDocumentById(this.eventModel, contentId, 'title slug thumbnail');
          return doc ? { title: doc.title, slug: doc.slug, thumbnail: doc.thumbnail } : null;
        case TrackableContentType.PRODUCT:
          doc = await this.findContentDocumentById(this.productModel, contentId, 'name slug images');
          return doc ? { title: doc.name, slug: doc.slug, thumbnail: doc.images?.[0] } : null;
        case TrackableContentType.POST:
          doc = await this.findContentDocumentById(this.postModel, contentId, 'content');
          return doc ? { title: doc.content?.substring(0, 50) + (doc.content?.length > 50 ? '...' : ''), slug: null, thumbnail: null } : null;
      }
    } catch (err) {
      console.warn(`[ContentTracking] Failed to load details for ${contentType} ${contentId}`, err);
    }
    return null;
  }

  /**
   * Obtenir ou créer un suivi de progression pour un contenu
   */
  async getOrCreateProgress(
    userId: string,
    contentId: string,
    contentType: TrackableContentType,
  ): Promise<ContentProgressDocument> {
    let progress = await this.contentProgressModel.findOne({
      userId: new Types.ObjectId(userId),
      contentId,
      contentType,
    });

    if (!progress) {
      progress = new this.contentProgressModel({
        id: new Types.ObjectId().toString(),
        userId: new Types.ObjectId(userId),
        contentId,
        contentType,
        isCompleted: false,
        watchTime: 0,
        lastAccessedAt: new Date(),
        bookmarks: [],
        viewCount: 0,
        likeCount: 0,
        shareCount: 0,
        downloadCount: 0,
        metadata: {},
      });
      await progress.save();
    }

    return progress;
  }

  async syncProgressSnapshot(
    userId: string,
    contentId: string,
    contentType: TrackableContentType,
    snapshot: {
      progressPercent?: number;
      watchTime?: number;
      isCompleted?: boolean;
      completedAt?: Date;
      lastAccessedAt?: Date;
      metadata?: Record<string, any>;
    },
  ): Promise<ContentProgressDocument> {
    if (
      snapshot.progressPercent !== undefined &&
      (snapshot.progressPercent < 0 || snapshot.progressPercent > 100)
    ) {
      throw new BadRequestException('Progress must be between 0 and 100');
    }

    const progress = await this.getOrCreateProgress(userId, contentId, contentType);

    if (snapshot.watchTime !== undefined && Number.isFinite(snapshot.watchTime) && snapshot.watchTime >= 0) {
      progress.watchTime = Math.max(Number(progress.watchTime || 0), Math.floor(snapshot.watchTime));
    }

    if (!progress.metadata) {
      progress.metadata = {};
    }

    if (snapshot.progressPercent !== undefined) {
      progress.metadata.progressPercent = snapshot.progressPercent;
    }

    if (snapshot.metadata && typeof snapshot.metadata === 'object') {
      progress.metadata = { ...progress.metadata, ...snapshot.metadata };
    }

    if (snapshot.isCompleted === true) {
      progress.isCompleted = true;
      if (snapshot.completedAt instanceof Date) {
        progress.completedAt = snapshot.completedAt;
      } else if (!progress.completedAt) {
        progress.completedAt = new Date();
      }
    }

    if (snapshot.lastAccessedAt instanceof Date) {
      progress.lastAccessedAt = snapshot.lastAccessedAt;
    } else {
      progress.mettreAJourDernierAcces();
    }

    await progress.save();
    return progress;
  }

  /**
   * Enregistrer une action de tracking
   */
  async trackAction(
    userId: string,
    contentId: string,
    contentType: TrackableContentType,
    actionType: TrackingActionType,
    metadata: Record<string, any> = {},
  ): Promise<TrackingActionDocument> {
    const normalizedMetadata = this.normalizeMetadata(metadata);
    const action = new this.trackingActionModel({
      id: new Types.ObjectId().toString(),
      userId: new Types.ObjectId(userId),
      contentId,
      contentType,
      actionType,
      metadata: normalizedMetadata,
      timestamp: new Date(),
    });

    const saved = await action.save();

    // Mirror to GA4 according to the unified event schema
    const context = await this.getContentContext(contentId, contentType);
    
    const baseParams = {
      content_type: contentType,
      content_id: contentId,
      action_type: actionType,
      creator_id: context.creatorId,
      community_id: context.communityId,
      ...normalizedMetadata,
    };

    // Map TrackingActionType to GA4 event names
    let ga4EventName: string | null = null;
    if (actionType === TrackingActionType.VIEW) ga4EventName = 'content_view';
    else if (actionType === TrackingActionType.START) ga4EventName = 'content_start';
    else if (actionType === TrackingActionType.COMPLETE) ga4EventName = 'content_complete';
    else if (actionType === TrackingActionType.CHAPTER_START) ga4EventName = 'content_chapter_start';
    else if (actionType === TrackingActionType.CHAPTER_COMPLETE) ga4EventName = 'content_chapter_complete';
    else if (actionType === TrackingActionType.LIKE) ga4EventName = 'content_like';
    else if (actionType === TrackingActionType.SHARE) ga4EventName = 'content_share';
    else if (actionType === TrackingActionType.DOWNLOAD) ga4EventName = 'content_download';
    else if (actionType === TrackingActionType.BOOKMARK) ga4EventName = 'content_bookmark';
    else if (actionType === TrackingActionType.COMMENT) ga4EventName = 'content_comment';
    else if (actionType === TrackingActionType.RATE) ga4EventName = 'content_rate';

    if (ga4EventName) {
      void this.ga4Service.sendEvent({
        userId,
        clientId: undefined,
        name: ga4EventName,
        params: baseParams,
      });
    }

    return saved;
  }

  /**
   * Marquer un contenu comme visualisé
   */
  async trackView(
    userId: string,
    contentId: string,
    contentType: TrackableContentType,
    metadata: Record<string, any> = {},
  ): Promise<ContentProgressDocument> {
    const progress = await this.getOrCreateProgress(
      userId,
      contentId,
      contentType,
    );
    progress.incrementerView();
    await progress.save();

    // Enregistrer l'action
    await this.trackAction(
      userId,
      contentId,
      contentType,
      TrackingActionType.VIEW,
      metadata
    );

    return progress;
  }

  /**
   * Marquer un contenu comme démarré
   */
  async trackStart(
    userId: string,
    contentId: string,
    contentType: TrackableContentType,
    metadata: Record<string, any> = {},
  ): Promise<ContentProgressDocument> {
    const progress = await this.getOrCreateProgress(
      userId,
      contentId,
      contentType,
    );
    progress.mettreAJourDernierAcces();
    await progress.save();

    console.log(`[CONTENT-TRACKING-SERVICE] TrackStart: user=${userId}, content=${contentId}, type=${contentType}`);

    // Enregistrer l'action
    await this.trackAction(
      userId,
      contentId,
      contentType,
      TrackingActionType.START,
      metadata
    );

    return progress;
  }

  /**
   * Marquer un contenu comme terminé
   */
  async trackComplete(
    userId: string,
    contentId: string,
    contentType: TrackableContentType,
    metadata: Record<string, any> = {},
  ): Promise<ContentProgressDocument> {
    const progress = await this.getOrCreateProgress(
      userId,
      contentId,
      contentType,
    );
    progress.marquerComplete();
    await progress.save();

    // Enregistrer l'action
    await this.trackAction(
      userId,
      contentId,
      contentType,
      TrackingActionType.COMPLETE,
      metadata
    );

    return progress;
  }

  async trackChapterStart(
    userId: string,
    courseId: string,
    chapterId: string,
    metadata: Record<string, any> = {},
  ): Promise<TrackingActionDocument> {
    return await this.trackAction(
      userId,
      courseId,
      TrackableContentType.COURSE,
      TrackingActionType.CHAPTER_START,
      {
        chapterId,
        progressScope: 'chapter',
        ...metadata,
      },
    );
  }

  async trackChapterStartOnce(
    userId: string,
    courseId: string,
    chapterId: string,
    options: { dedupeMinutes?: number; metadata?: Record<string, any> } = {},
  ): Promise<TrackingActionDocument | null> {
    const dedupeMinutes = Math.max(1, Math.floor(Number(options.dedupeMinutes ?? 30)));
    const since = new Date(Date.now() - dedupeMinutes * 60_000);

    const existing = await this.trackingActionModel
      .findOne({
        userId: new Types.ObjectId(userId),
        contentId: courseId,
        contentType: TrackableContentType.COURSE,
        actionType: TrackingActionType.CHAPTER_START,
        'metadata.chapterId': chapterId,
        timestamp: { $gte: since },
      })
      .select('_id')
      .lean();

    if (existing) return null;
    return this.trackChapterStart(userId, courseId, chapterId, options.metadata || {});
  }

  async trackChapterComplete(
    userId: string,
    courseId: string,
    chapterId: string,
    metadata: Record<string, any> = {},
  ): Promise<TrackingActionDocument> {
    return await this.trackAction(
      userId,
      courseId,
      TrackableContentType.COURSE,
      TrackingActionType.CHAPTER_COMPLETE,
      {
        chapterId,
        progressScope: 'chapter',
        ...metadata,
      },
    );
  }

  /**
   * Mettre à jour le temps de visionnage
   */
  async updateWatchTime(
    userId: string,
    contentId: string,
    contentType: TrackableContentType,
    additionalTime: number,
    options: {
      maxDurationSeconds?: number;
    } = {},
  ): Promise<ContentProgressDocument> {
    const normalizedAdditionalTime = Math.floor(Number(additionalTime || 0));
    if (!Number.isFinite(normalizedAdditionalTime) || normalizedAdditionalTime < 0) {
      throw new BadRequestException('Watch time increment must be a non-negative number');
    }

    const progress = await this.getOrCreateProgress(
      userId,
      contentId,
      contentType,
    );

    const currentWatchTimeSeconds = Math.floor(Number(progress.watchTime || 0));
    const nextWatchTimeSeconds = currentWatchTimeSeconds + normalizedAdditionalTime;
    const policy = applyWatchTimePolicy({
      currentWatchTimeSeconds,
      requestedWatchTimeSeconds: nextWatchTimeSeconds,
      lastAcceptedAt: progress.lastAccessedAt,
      maxDurationSeconds: options.maxDurationSeconds,
    });

    if (policy.ignored) {
      progress.mettreAJourDernierAcces();
      await progress.save();
      return progress;
    }

    if (policy.acceptedAdvanceSeconds > policy.maxAllowedAdvanceSeconds) {
      throw new BadRequestException(
        `Watch time jump rejected. Maximum allowed advance is ${policy.maxAllowedAdvanceSeconds} seconds.`,
      );
    }

    progress.watchTime = policy.acceptedWatchTimeSeconds;
    progress.mettreAJourDernierAcces();
    await progress.save();

    return progress;
  }

  /**
   * Mettre à jour la progression (pourcentage)
   */
  async updateProgress(
    userId: string,
    contentId: string,
    contentType: TrackableContentType,
    progressPercent: number,
    metadata: Record<string, any> = {},
  ): Promise<ContentProgressDocument> {
    if (progressPercent < 0 || progressPercent > 100) {
      throw new BadRequestException('Progress must be between 0 and 100');
    }

    const progress = await this.getOrCreateProgress(
      userId,
      contentId,
      contentType,
    );
    
    // Update progress metadata
    if (!progress.metadata) progress.metadata = {};
    progress.metadata['progressPercent'] = progressPercent;
    
    // Auto-complete if 100%
    if (progressPercent === 100 && !progress.isCompleted) {
      progress.marquerComplete();
    } else {
      progress.mettreAJourDernierAcces();
    }

    // Merge additional metadata
    if (Object.keys(metadata).length > 0) {
      progress.metadata = { ...progress.metadata, ...metadata };
    }

    await progress.save();

    // Log action if significant progress
    if (progressPercent > 0) {
      await this.trackAction(
        userId,
        contentId,
        contentType,
        TrackingActionType.START, // Reusing START/UPDATE semantics
        { progressPercent, ...metadata }
      );
    }

    return progress;
  }

  /**
   * Ajouter un like
   */
  async trackLike(
    userId: string,
    contentId: string,
    contentType: TrackableContentType,
    metadata: Record<string, any> = {},
  ): Promise<ContentProgressDocument> {
    const progress = await this.getOrCreateProgress(
      userId,
      contentId,
      contentType,
    );
    progress.incrementerLike();
    await progress.save();

    // Enregistrer l'action
    await this.trackAction(
      userId,
      contentId,
      contentType,
      TrackingActionType.LIKE,
      metadata,
    );

    return progress;
  }

  /**
   * Ajouter un partage
   */
  async trackShare(
    userId: string,
    contentId: string,
    contentType: TrackableContentType,
    metadata: Record<string, any> = {},
  ): Promise<ContentProgressDocument> {
    const progress = await this.getOrCreateProgress(
      userId,
      contentId,
      contentType,
    );
    progress.incrementerShare();
    await progress.save();

    // Enregistrer l'action
    await this.trackAction(
      userId,
      contentId,
      contentType,
      TrackingActionType.SHARE,
      metadata,
    );

    return progress;
  }

  /**
   * Ajouter un téléchargement
   */
  async trackDownload(
    userId: string,
    contentId: string,
    contentType: TrackableContentType,
    metadata: Record<string, any> = {},
  ): Promise<ContentProgressDocument> {
    const progress = await this.getOrCreateProgress(
      userId,
      contentId,
      contentType,
    );
    progress.incrementerDownload();
    await progress.save();

    // Enregistrer l'action
    await this.trackAction(
      userId,
      contentId,
      contentType,
      TrackingActionType.DOWNLOAD,
      metadata,
    );

    return progress;
  }

  /**
   * Ajouter un bookmark
   */
  async addBookmark(
    userId: string,
    contentId: string,
    contentType: TrackableContentType,
    bookmarkId: string,
    metadata: Record<string, any> = {},
  ): Promise<ContentProgressDocument> {
    const progress = await this.getOrCreateProgress(
      userId,
      contentId,
      contentType,
    );
    progress.ajouterBookmark(bookmarkId);
    await progress.save();

    // Enregistrer l'action
    await this.trackAction(
      userId,
      contentId,
      contentType,
      TrackingActionType.BOOKMARK,
      { bookmarkId, ...metadata },
    );

    return progress;
  }

  /**
   * Retirer un bookmark
   */
  async removeBookmark(
    userId: string,
    contentId: string,
    contentType: TrackableContentType,
    bookmarkId: string,
  ): Promise<ContentProgressDocument> {
    const progress = await this.getOrCreateProgress(
      userId,
      contentId,
      contentType,
    );
    progress.retirerBookmark(bookmarkId);
    await progress.save();

    return progress;
  }

  /**
   * Ajouter une note/évaluation
   */
  async addRating(
    userId: string,
    contentId: string,
    contentType: TrackableContentType,
    rating: number,
    review?: string,
  ): Promise<ContentProgressDocument> {
    if (rating < 1 || rating > 5) {
      throw new BadRequestException('La note doit être entre 1 et 5');
    }

    const progress = await this.getOrCreateProgress(
      userId,
      contentId,
      contentType,
    );
    progress.rating = rating;
    if (review) {
      progress.review = review;
    }
    await progress.save();

    // Enregistrer l'action
    await this.trackAction(
      userId,
      contentId,
      contentType,
      TrackingActionType.RATE,
      { rating, review },
    );

    return progress;
  }

  /**
   * Obtenir la progression d'un utilisateur pour un contenu
   */
  async getProgress(
    userId: string,
    contentId: string,
    contentType: TrackableContentType,
  ): Promise<ContentProgressDocument | null> {
    return await this.contentProgressModel.findOne({
      userId: new Types.ObjectId(userId),
      contentId,
      contentType,
    });
  }

  /**
   * Obtenir toutes les progressions d'un utilisateur pour un type de contenu
   */
  async getUserProgressByType(
    userId: string,
    contentType: TrackableContentType,
    page: number = 1,
    limit: number = 10,
  ) {
    const skip = (page - 1) * limit;

    const [progress, total] = await Promise.all([
      this.contentProgressModel
        .find({ userId: new Types.ObjectId(userId), contentType })
        .sort({ lastAccessedAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.contentProgressModel.countDocuments({
        userId: new Types.ObjectId(userId),
        contentType,
      }),
    ]);

    return {
      progress,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Obtenir la progression d'un utilisateur pour plusieurs types de contenus
   */
  async getUserProgressOverview(
    userId: string,
    contentTypes?: TrackableContentType[],
    page: number = 1,
    limit: number = 20,
    contentFilters?: Partial<Record<TrackableContentType, string[]>>,
  ) {
    const skip = (page - 1) * limit;
    const filter: any = {
      userId: new Types.ObjectId(userId),
    };

    if (contentTypes && contentTypes.length > 0) {
      filter.contentType = { $in: contentTypes };
    }

    if (contentFilters) {
      const orFilters = Object.entries(contentFilters)
        .filter(([, ids]) => ids && ids.length > 0)
        .map(([contentType, ids]) => ({
          contentType,
          contentId: { $in: ids },
        }));

      if (orFilters.length === 0) {
        return {
          items: [],
          total: 0,
          page,
          limit,
          totalPages: 0,
        };
      }

      filter.$or = orFilters;
    }

    const [items, total] = await Promise.all([
      this.contentProgressModel
        .find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.contentProgressModel.countDocuments(filter),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Obtenir les statistiques d'un contenu
   */
  async getContentStats(contentId: string, contentType: TrackableContentType) {
    const stats = await this.contentProgressModel.aggregate([
      { $match: { contentId, contentType } },
      {
        $group: {
          _id: null,
          totalViews: { $sum: '$viewCount' },
          totalLikes: { $sum: '$likeCount' },
          totalShares: { $sum: '$shareCount' },
          totalDownloads: { $sum: '$downloadCount' },
          totalCompleted: { $sum: { $cond: ['$isCompleted', 1, 0] } },
          // Only average ratings > 0 (ignore unrated progress docs)
          averageRating: {
            $avg: {
              $cond: [{ $gt: ['$rating', 0] }, '$rating', null],
            },
          },
          totalRatings: { $sum: { $cond: [{ $gt: ['$rating', 0] }, 1, 0] } },
          totalWatchTime: { $sum: '$watchTime' },
        },
      },
    ]);

    return (
      stats[0] || {
        totalViews: 0,
        totalLikes: 0,
        totalShares: 0,
        totalDownloads: 0,
        totalCompleted: 0,
        averageRating: 0,
        totalRatings: 0,
        totalWatchTime: 0,
      }
    );
  }

  /**
   * Obtenir les actions récentes d'un utilisateur
   */
  async getUserRecentActions(
    userId: string,
    contentType?: TrackableContentType,
    limit: number = 20,
  ): Promise<any[]> {
    const filter: any = { userId: new Types.ObjectId(userId) };
    if (contentType) {
      filter.contentType = contentType;
    }

    const actions = await this.trackingActionModel
      .find(filter)
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean()
      .exec();

    // Enrich with content details
    const enrichedActions = await Promise.all(actions.map(async (action) => {
      const details = await this.getContentDetails(action.contentId, action.contentType);
      return {
        ...action,
        contentDetails: details
      };
    }));

    return enrichedActions;
  }
}
