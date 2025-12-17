import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { 
  ContentProgress, 
  ContentProgressDocument, 
  TrackingAction, 
  TrackingActionDocument,
  TrackableContentType,
  TrackingActionType 
} from '../../schema/content-tracking.schema';

@Injectable()
export class ContentTrackingService {
  constructor(
    @InjectModel('ContentProgress') private contentProgressModel: Model<ContentProgressDocument>,
    @InjectModel('TrackingAction') private trackingActionModel: Model<TrackingActionDocument>,
  ) {}

  /**
   * Obtenir ou créer un suivi de progression pour un contenu
   */
  async getOrCreateProgress(
    userId: string, 
    contentId: string, 
    contentType: TrackableContentType
  ): Promise<ContentProgressDocument> {
    let progress = await this.contentProgressModel.findOne({
      userId: new Types.ObjectId(userId),
      contentId,
      contentType
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
        metadata: {}
      });
      await progress.save();
    }

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
    metadata: Record<string, any> = {}
  ): Promise<TrackingActionDocument> {
    const action = new this.trackingActionModel({
      id: new Types.ObjectId().toString(),
      userId: new Types.ObjectId(userId),
      contentId,
      contentType,
      actionType,
      metadata,
      timestamp: new Date()
    });

    return await action.save();
  }

  /**
   * Marquer un contenu comme visualisé
   */
  async trackView(
    userId: string,
    contentId: string,
    contentType: TrackableContentType
  ): Promise<ContentProgressDocument> {
    const progress = await this.getOrCreateProgress(userId, contentId, contentType);
    progress.incrementerView();
    await progress.save();

    // Enregistrer l'action
    await this.trackAction(userId, contentId, contentType, TrackingActionType.VIEW);

    return progress;
  }

  /**
   * Marquer un contenu comme démarré
   */
  async trackStart(
    userId: string,
    contentId: string,
    contentType: TrackableContentType
  ): Promise<ContentProgressDocument> {
    const progress = await this.getOrCreateProgress(userId, contentId, contentType);
    progress.mettreAJourDernierAcces();
    await progress.save();

    // Enregistrer l'action
    await this.trackAction(userId, contentId, contentType, TrackingActionType.START);

    return progress;
  }

  /**
   * Marquer un contenu comme terminé
   */
  async trackComplete(
    userId: string,
    contentId: string,
    contentType: TrackableContentType
  ): Promise<ContentProgressDocument> {
    const progress = await this.getOrCreateProgress(userId, contentId, contentType);
    progress.marquerComplete();
    await progress.save();

    // Enregistrer l'action
    await this.trackAction(userId, contentId, contentType, TrackingActionType.COMPLETE);

    return progress;
  }

  /**
   * Mettre à jour le temps de visionnage
   */
  async updateWatchTime(
    userId: string,
    contentId: string,
    contentType: TrackableContentType,
    additionalTime: number
  ): Promise<ContentProgressDocument> {
    const progress = await this.getOrCreateProgress(userId, contentId, contentType);
    progress.ajouterTempsVisionne(additionalTime);
    await progress.save();

    return progress;
  }

  /**
   * Ajouter un like
   */
  async trackLike(
    userId: string,
    contentId: string,
    contentType: TrackableContentType
  ): Promise<ContentProgressDocument> {
    const progress = await this.getOrCreateProgress(userId, contentId, contentType);
    progress.incrementerLike();
    await progress.save();

    // Enregistrer l'action
    await this.trackAction(userId, contentId, contentType, TrackingActionType.LIKE);

    return progress;
  }

  /**
   * Ajouter un partage
   */
  async trackShare(
    userId: string,
    contentId: string,
    contentType: TrackableContentType
  ): Promise<ContentProgressDocument> {
    const progress = await this.getOrCreateProgress(userId, contentId, contentType);
    progress.incrementerShare();
    await progress.save();

    // Enregistrer l'action
    await this.trackAction(userId, contentId, contentType, TrackingActionType.SHARE);

    return progress;
  }

  /**
   * Ajouter un téléchargement
   */
  async trackDownload(
    userId: string,
    contentId: string,
    contentType: TrackableContentType
  ): Promise<ContentProgressDocument> {
    const progress = await this.getOrCreateProgress(userId, contentId, contentType);
    progress.incrementerDownload();
    await progress.save();

    // Enregistrer l'action
    await this.trackAction(userId, contentId, contentType, TrackingActionType.DOWNLOAD);

    return progress;
  }

  /**
   * Ajouter un bookmark
   */
  async addBookmark(
    userId: string,
    contentId: string,
    contentType: TrackableContentType,
    bookmarkId: string
  ): Promise<ContentProgressDocument> {
    const progress = await this.getOrCreateProgress(userId, contentId, contentType);
    progress.ajouterBookmark(bookmarkId);
    await progress.save();

    // Enregistrer l'action
    await this.trackAction(userId, contentId, contentType, TrackingActionType.BOOKMARK, { bookmarkId });

    return progress;
  }

  /**
   * Retirer un bookmark
   */
  async removeBookmark(
    userId: string,
    contentId: string,
    contentType: TrackableContentType,
    bookmarkId: string
  ): Promise<ContentProgressDocument> {
    const progress = await this.getOrCreateProgress(userId, contentId, contentType);
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
    review?: string
  ): Promise<ContentProgressDocument> {
    if (rating < 1 || rating > 5) {
      throw new BadRequestException('La note doit être entre 1 et 5');
    }

    const progress = await this.getOrCreateProgress(userId, contentId, contentType);
    progress.rating = rating;
    if (review) {
      progress.review = review;
    }
    await progress.save();

    // Enregistrer l'action
    await this.trackAction(userId, contentId, contentType, TrackingActionType.RATE, { rating, review });

    return progress;
  }

  /**
   * Obtenir la progression d'un utilisateur pour un contenu
   */
  async getProgress(
    userId: string,
    contentId: string,
    contentType: TrackableContentType
  ): Promise<ContentProgressDocument | null> {
    return await this.contentProgressModel.findOne({
      userId: new Types.ObjectId(userId),
      contentId,
      contentType
    });
  }

  /**
   * Obtenir toutes les progressions d'un utilisateur pour un type de contenu
   */
  async getUserProgressByType(
    userId: string,
    contentType: TrackableContentType,
    page: number = 1,
    limit: number = 10
  ) {
    const skip = (page - 1) * limit;

    const [progress, total] = await Promise.all([
      this.contentProgressModel
        .find({ userId: new Types.ObjectId(userId), contentType })
        .sort({ lastAccessedAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.contentProgressModel.countDocuments({ userId: new Types.ObjectId(userId), contentType })
    ]);

    return {
      progress,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
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
    contentFilters?: Partial<Record<TrackableContentType, string[]>>
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
          averageRating: { $avg: '$rating' },
          totalWatchTime: { $sum: '$watchTime' }
        }
      }
    ]);

    return stats[0] || {
      totalViews: 0,
      totalLikes: 0,
      totalShares: 0,
      totalDownloads: 0,
      totalCompleted: 0,
      averageRating: 0,
      totalWatchTime: 0
    };
  }

  /**
   * Obtenir les actions récentes d'un utilisateur
   */
  async getUserRecentActions(
    userId: string,
    contentType?: TrackableContentType,
    limit: number = 20
  ) {
    const filter: any = { userId: new Types.ObjectId(userId) };
    if (contentType) {
      filter.contentType = contentType;
    }

    return await this.trackingActionModel
      .find(filter)
      .sort({ timestamp: -1 })
      .limit(limit)
      .exec();
  }
}
