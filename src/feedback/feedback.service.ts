
import { Injectable, NotFoundException } from '@nestjs/common';
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
  ) {}

  async create(createFeedbackDto: CreateFeedbackDto, userId: string): Promise<Feedback> {
    const { relatedTo, relatedModel, rating, comment } = createFeedbackDto;

    const existingFeedback = await this.feedbackModel.findOne({
      relatedTo,
      relatedModel,
      user: new Types.ObjectId(userId),
    });

    if (existingFeedback) {
      existingFeedback.rating = rating;
      existingFeedback.comment = comment;
      await existingFeedback.save();

      // Update average rating
      await this.recalculateAverageRating(relatedTo, relatedModel);

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
      relatedTo,
      relatedModel,
      rating,
      comment,
      user: new Types.ObjectId(userId),
    });

    const savedFeedback = await newFeedback.save();

    await this.recalculateAverageRating(relatedTo, relatedModel);
    
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

    feedback.rating = rating;
    feedback.comment = comment;
    await feedback.save();

    // Update average rating
    await this.recalculateAverageRating(feedback.relatedTo.toString(), feedback.relatedModel);
    
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
    const feedbacks = await this.feedbackModel
      .find({ relatedModel, relatedTo })
      .populate('user', 'name email photo_profil')
      .sort({ createdAt: -1 })
      .exec();

    return feedbacks.map(f => ({
      _id: f._id,
      relatedTo: f.relatedTo,
      relatedModel: f.relatedModel,
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
    return this.feedbackModel.findOne({
      relatedModel,
      relatedTo,
      user: new Types.ObjectId(userId),
    })
    .populate('user', 'name email photo_profil')
    .exec();
  }

  async getStats(relatedModel: string, relatedTo: string): Promise<{ averageRating: number; ratingCount: number; distribution: Record<number, number> }> {
    const feedbacks = await this.feedbackModel.find({ relatedModel, relatedTo }).exec();
    
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
    const model = this.getModel(relatedModel);
    const item = await model.findById(relatedTo);

    if (!item) {
      throw new NotFoundException(`${relatedModel} not found`);
    }

    const feedbacks = await this.feedbackModel.find({ relatedModel, relatedTo }).exec();
    
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
    switch (relatedModel) {
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
        throw new NotFoundException(`Model ${relatedModel} not found`);
    }
  }
}
