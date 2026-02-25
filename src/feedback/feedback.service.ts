import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Feedback } from '../schema/feedback.schema';
import { CreateFeedbackDto } from '../dto-feedback/create-feedback.dto';
import { Community } from '../schema/community.schema';
import { Cours } from '../schema/course.schema';
import { Challenge } from '../schema/challenge.schema';
import { Event } from '../schema/event.schema';
import { Product } from '../schema/product.schema';
import { Session } from '../schema/session.schema';
import { CacheInvalidationService } from '../common/services/cache-invalidation.service';

@Injectable()
export class FeedbackService {
  constructor(
    @InjectModel(Feedback.name) private feedbackModel: Model<Feedback>,
    @InjectModel(Community.name) private communityModel: Model<Community>,
    @InjectModel('Cours') private coursModel: Model<Cours>,
    @InjectModel(Challenge.name) private challengeModel: Model<Challenge>,
    @InjectModel(Event.name) private eventModel: Model<Event>,
    @InjectModel(Product.name) private productModel: Model<Product>,
    @InjectModel(Session.name) private sessionModel: Model<Session>,
    private cacheInvalidationService: CacheInvalidationService,
  ) {}

  private normalizeRelatedModel(relatedModel: string): string {
    const normalized = String(relatedModel || '').trim().toLowerCase();
    const modelMap: Record<string, string> = {
      community: 'Community',
      cours: 'Cours',
      challenge: 'Challenge',
      event: 'Event',
      product: 'Product',
      session: 'Session',
    };

    return modelMap[normalized] || relatedModel;
  }

  private getRelatedModelVariants(canonicalModel: string): string[] {
    const variants = new Set<string>([canonicalModel]);
    if (canonicalModel) {
      variants.add(canonicalModel.toLowerCase());
    }
    return Array.from(variants);
  }

  private async resolveSessionFeedbackScope(
    relatedTo: string,
    options?: { requireExists?: boolean },
  ): Promise<{
    canonicalRelatedTo: string;
    relatedToCandidates: string[];
    session: any | null;
  }> {
    const normalizedRelatedTo = String(relatedTo || '').trim();
    const relatedToCandidates = new Set<string>();
    if (normalizedRelatedTo) {
      relatedToCandidates.add(normalizedRelatedTo);
    }

    let session: any | null = null;

    if (normalizedRelatedTo) {
      if (Types.ObjectId.isValid(normalizedRelatedTo)) {
        session = await this.sessionModel
          .findById(normalizedRelatedTo)
          .select('_id id creatorId bookings')
          .exec();
      }

      if (!session) {
        session = await this.sessionModel
          .findOne({ id: normalizedRelatedTo })
          .select('_id id creatorId bookings')
          .exec();
      }
    }

    if (!session) {
      if (options?.requireExists) {
        throw new NotFoundException('Session not found');
      }

      return {
        canonicalRelatedTo: normalizedRelatedTo,
        relatedToCandidates: Array.from(relatedToCandidates),
        session: null,
      };
    }

    const canonicalRelatedTo = session._id.toString();
    relatedToCandidates.add(canonicalRelatedTo);
    if (session.id) {
      relatedToCandidates.add(String(session.id));
    }

    return {
      canonicalRelatedTo,
      relatedToCandidates: Array.from(relatedToCandidates),
      session,
    };
  }

  private assertSessionReviewEligibility(session: any, userId: string): void {
    const normalizedUserId = String(userId || '');
    const creatorId = String(session?.creatorId || '');

    if (creatorId && creatorId === normalizedUserId) {
      throw new ForbiddenException('Session creators cannot review their own sessions.');
    }

    const hasCompletedBooking = Array.isArray(session?.bookings)
      ? session.bookings.some((booking: any) => {
          if (String(booking?.userId || '') !== normalizedUserId) {
            return false;
          }

          if (booking?.status === 'completed') {
            return true;
          }

          // Backward compatibility: allow reviewing confirmed sessions that already ended.
          if (booking?.status === 'confirmed') {
            const scheduledAt = new Date(booking?.scheduledAt);
            if (Number.isNaN(scheduledAt.getTime())) {
              return false;
            }

            const durationMinutes = Number(session?.duration || 60);
            const sessionEnd = new Date(scheduledAt.getTime() + durationMinutes * 60 * 1000);
            return sessionEnd.getTime() <= Date.now();
          }

          return false;
        })
      : false;

    if (!hasCompletedBooking) {
      throw new ForbiddenException(
        'You can submit feedback only after your session is completed.',
      );
    }
  }

  async create(createFeedbackDto: CreateFeedbackDto, userId: string): Promise<Feedback> {
    const { relatedTo, relatedModel, rating, comment } = createFeedbackDto;
    const canonicalRelatedModel = this.normalizeRelatedModel(relatedModel);
    const relatedModelVariants = this.getRelatedModelVariants(canonicalRelatedModel);
    let resolvedRelatedTo = String(relatedTo || '').trim();
    let relatedToCandidates = [resolvedRelatedTo];

    if (canonicalRelatedModel === 'Session') {
      const sessionScope = await this.resolveSessionFeedbackScope(resolvedRelatedTo, {
        requireExists: true,
      });
      resolvedRelatedTo = sessionScope.canonicalRelatedTo;
      relatedToCandidates = sessionScope.relatedToCandidates;
      this.assertSessionReviewEligibility(sessionScope.session, userId);
    }

    const existingFeedback = await this.feedbackModel.findOne({
      relatedTo: { $in: relatedToCandidates },
      relatedModel: { $in: relatedModelVariants },
      user: new Types.ObjectId(userId),
    });

    if (existingFeedback) {
      existingFeedback.relatedTo = new Types.ObjectId(resolvedRelatedTo) as any;
      existingFeedback.relatedModel = canonicalRelatedModel;
      existingFeedback.rating = rating;
      existingFeedback.comment = comment;
      await existingFeedback.save();

      // Update average rating
      await this.recalculateAverageRating(resolvedRelatedTo, canonicalRelatedModel);

      // Invalidate cache
      await this.cacheInvalidationService.invalidateFeedback(
        canonicalRelatedModel,
        resolvedRelatedTo,
      );

      const populatedFeedback = await this.feedbackModel
        .findById(existingFeedback._id)
        .populate('user', 'name email photo_profil')
        .exec();

      if (!populatedFeedback) {
        throw new NotFoundException('Failed to retrieve updated feedback');
      }

      return populatedFeedback;
    }

    const newFeedback = new this.feedbackModel({
      relatedTo: resolvedRelatedTo,
      relatedModel: canonicalRelatedModel,
      rating,
      comment,
      user: new Types.ObjectId(userId),
    });

    const savedFeedback = await newFeedback.save();

    await this.recalculateAverageRating(resolvedRelatedTo, canonicalRelatedModel);

    // Invalidate cache
    await this.cacheInvalidationService.invalidateFeedback(canonicalRelatedModel, resolvedRelatedTo);

    // Populate user data before returning
    const populatedFeedback = await this.feedbackModel
      .findById(savedFeedback._id)
      .populate('user', 'name email photo_profil')
      .exec();
    
    if (!populatedFeedback) {
      throw new NotFoundException('Failed to retrieve created feedback');
    }
    
    return populatedFeedback;
  }

  async update(feedbackId: string, userId: string, rating: number, comment?: string): Promise<Feedback> {
    const feedback = await this.feedbackModel.findOne({
      _id: new Types.ObjectId(feedbackId),
      user: new Types.ObjectId(userId),
    });

    if (!feedback) {
      throw new NotFoundException('Feedback not found or you are not authorized to update it.');
    }

    const canonicalRelatedModel = this.normalizeRelatedModel(feedback.relatedModel);
    let resolvedRelatedTo = feedback.relatedTo.toString();

    if (canonicalRelatedModel === 'Session') {
      const sessionScope = await this.resolveSessionFeedbackScope(resolvedRelatedTo, {
        requireExists: true,
      });
      resolvedRelatedTo = sessionScope.canonicalRelatedTo;
      this.assertSessionReviewEligibility(sessionScope.session, userId);
      feedback.relatedTo = new Types.ObjectId(resolvedRelatedTo) as any;
    }

    feedback.relatedModel = canonicalRelatedModel;
    feedback.rating = rating;
    feedback.comment = comment;
    await feedback.save();

    // Update average rating
    await this.recalculateAverageRating(resolvedRelatedTo, canonicalRelatedModel);

    // Invalidate cache
    await this.cacheInvalidationService.invalidateFeedback(canonicalRelatedModel, resolvedRelatedTo);

    // Populate user data before returning
    const populatedFeedback = await this.feedbackModel
      .findById(feedbackId)
      .populate('user', 'name email photo_profil')
      .exec();
    
    if (!populatedFeedback) {
      throw new NotFoundException('Failed to retrieve updated feedback');
    }
    
    return populatedFeedback;
  }

  async findByRelated(relatedModel: string, relatedTo: string): Promise<any[]> {
    const canonicalRelatedModel = this.normalizeRelatedModel(relatedModel);
    const relatedModelVariants = this.getRelatedModelVariants(canonicalRelatedModel);
    let relatedToFilter: any = relatedTo;

    if (canonicalRelatedModel === 'Session') {
      const sessionScope = await this.resolveSessionFeedbackScope(relatedTo);
      relatedToFilter = { $in: sessionScope.relatedToCandidates };
    }

    const feedbacks = await this.feedbackModel
      .find({ relatedModel: { $in: relatedModelVariants }, relatedTo: relatedToFilter })
      .populate('user', 'name email photo_profil')
      .sort({ createdAt: -1 })
      .exec();

    return feedbacks.map(f => ({
      _id: f._id,
      relatedTo: f.relatedTo,
      relatedModel: canonicalRelatedModel,
      rating: f.rating,
      comment: f.comment,
      createdAt: (f as any).createdAt,
      updatedAt: (f as any).updatedAt,
      user: {
        _id: (f.user as any)?._id,
        name: (f.user as any)?.name || 'Anonymous',
        avatar: (f.user as any)?.photo_profil,
      },
    }));
  }

  async findUserFeedback(relatedModel: string, relatedTo: string, userId: string): Promise<Feedback | null> {
    const canonicalRelatedModel = this.normalizeRelatedModel(relatedModel);
    const relatedModelVariants = this.getRelatedModelVariants(canonicalRelatedModel);
    let relatedToFilter: any = relatedTo;

    if (canonicalRelatedModel === 'Session') {
      const sessionScope = await this.resolveSessionFeedbackScope(relatedTo);
      relatedToFilter = { $in: sessionScope.relatedToCandidates };
    }

    return this.feedbackModel.findOne({
      relatedModel: { $in: relatedModelVariants },
      relatedTo: relatedToFilter,
      user: new Types.ObjectId(userId),
    })
    .populate('user', 'name email photo_profil')
    .exec();
  }

  async getStats(relatedModel: string, relatedTo: string): Promise<{ averageRating: number; ratingCount: number; distribution: Record<number, number> }> {
    const canonicalRelatedModel = this.normalizeRelatedModel(relatedModel);
    const relatedModelVariants = this.getRelatedModelVariants(canonicalRelatedModel);
    let relatedToFilter: any = relatedTo;

    if (canonicalRelatedModel === 'Session') {
      const sessionScope = await this.resolveSessionFeedbackScope(relatedTo);
      relatedToFilter = { $in: sessionScope.relatedToCandidates };
    }

    const feedbacks = await this.feedbackModel
      .find({ relatedModel: { $in: relatedModelVariants }, relatedTo: relatedToFilter })
      .exec();

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let totalRating = 0;

    feedbacks.forEach(f => {
      distribution[f.rating] = (distribution[f.rating] || 0) + 1;
      totalRating += f.rating;
    });

    return {
      averageRating: feedbacks.length > 0 ? totalRating / feedbacks.length : 0,
      ratingCount: feedbacks.length,
      distribution,
    };
  }

  private async recalculateAverageRating(relatedTo: string, relatedModel: string): Promise<void> {
    const canonicalRelatedModel = this.normalizeRelatedModel(relatedModel);
    const normalizedRelatedTo = String(relatedTo || '').trim();
    let resolvedRelatedTo = normalizedRelatedTo;
    let relatedToCandidates = [normalizedRelatedTo];

    if (canonicalRelatedModel === 'Session') {
      const sessionScope = await this.resolveSessionFeedbackScope(normalizedRelatedTo, {
        requireExists: true,
      });
      resolvedRelatedTo = sessionScope.canonicalRelatedTo;
      relatedToCandidates = sessionScope.relatedToCandidates;
    }

    const model = this.getModel(canonicalRelatedModel);
    const item = await model.findById(resolvedRelatedTo);

    if (!item) {
      throw new NotFoundException(`${canonicalRelatedModel} not found`);
    }

    const relatedModelVariants = this.getRelatedModelVariants(canonicalRelatedModel);
    const normalizedModelVariants = relatedModelVariants.filter(
      (value) => value !== canonicalRelatedModel,
    );

    if (canonicalRelatedModel === 'Session' || normalizedModelVariants.length > 0) {
      const updatePayload: Record<string, any> = {
        relatedModel: canonicalRelatedModel,
      };

      if (canonicalRelatedModel === 'Session') {
        updatePayload.relatedTo = new Types.ObjectId(resolvedRelatedTo);
      }

      await this.feedbackModel.updateMany(
        {
          relatedModel: { $in: relatedModelVariants },
          relatedTo: { $in: relatedToCandidates },
        },
        { $set: updatePayload },
      );
    }

    const feedbacks = await this.feedbackModel
      .find({ relatedModel: canonicalRelatedModel, relatedTo: { $in: relatedToCandidates } })
      .exec();

    if (feedbacks.length === 0) {
      item.averageRating = 0;
      item.ratingCount = 0;
    } else {
      const totalRating = feedbacks.reduce((sum, f) => sum + f.rating, 0);
      item.averageRating = totalRating / feedbacks.length;
      item.ratingCount = feedbacks.length;
    }

    await item.save();
  }

  private getModel(relatedModel: string): Model<any> {
    const canonicalRelatedModel = this.normalizeRelatedModel(relatedModel);
    switch (canonicalRelatedModel) {
      case 'Community':
        return this.communityModel;
      case 'Cours':
        return this.coursModel;
      case 'Challenge':
        return this.challengeModel;
      case 'Event':
        return this.eventModel;
      case 'Product':
        return this.productModel;
      case 'Session':
        return this.sessionModel;
      default:
        throw new NotFoundException(`Model ${canonicalRelatedModel} not found`);
    }
  }
}
