
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
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
      throw new ConflictException('You have already submitted feedback for this item.');
    }

    const newFeedback = new this.feedbackModel({
      relatedTo,
      relatedModel,
      rating,
      comment,
      user: new Types.ObjectId(userId),
    });

    await this.updateAverageRating(relatedTo, relatedModel, rating);

    return newFeedback.save();
  }

  async findByRelated(relatedModel: string, relatedTo: string): Promise<Feedback[]> {
    return this.feedbackModel.find({ relatedModel, relatedTo }).exec();
  }

  private async updateAverageRating(relatedTo: string, relatedModel: string, newRating: number): Promise<void> {
    const model = this.getModel(relatedModel);
    const item = await model.findById(relatedTo);

    if (!item) {
      throw new NotFoundException(`${relatedModel} not found`);
    }

    const oldRatingTotal = item.averageRating * item.ratingCount;
    const newRatingCount = item.ratingCount + 1;
    const newAverageRating = (oldRatingTotal + newRating) / newRatingCount;

    item.averageRating = newAverageRating;
    item.ratingCount = newRatingCount;

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
