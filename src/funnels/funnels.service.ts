import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Funnel, FunnelDocument } from '../schema/funnel.schema';
import { CreateFunnelDto } from './dto/create-funnel.dto';
import { UpdateFunnelDto } from './dto/update-funnel.dto';

@Injectable()
export class FunnelsService {
  constructor(
    @InjectModel(Funnel.name)
    private readonly funnelModel: Model<FunnelDocument>,
  ) {}

  async findAllByCreator(creatorId: string): Promise<any[]> {
    return this.funnelModel
      .find({ creator: new Types.ObjectId(creatorId) })
      .sort({ createdAt: -1 })
      .lean() as any;
  }

  async create(
    creatorId: string,
    dto: CreateFunnelDto,
  ): Promise<FunnelDocument> {
    const funnel = new this.funnelModel({
      creator: new Types.ObjectId(creatorId),
      name: dto.name,
      description: dto.description,
      steps: dto.steps ?? [],
      connections: dto.connections ?? [],
      status: 'draft',
      analytics: {
        totalVisitors: 0,
        totalConversions: 0,
        overallConversionRate: 0,
        revenue: 0,
      },
    });
    return funnel.save();
  }

  async findOneByCreator(id: string, creatorId: string): Promise<any> {
    const funnel = await this.funnelModel
      .findOne({
        _id: new Types.ObjectId(id),
        creator: new Types.ObjectId(creatorId),
      })
      .lean();
    if (!funnel) throw new NotFoundException('Funnel not found');
    return funnel;
  }

  async update(
    id: string,
    creatorId: string,
    dto: UpdateFunnelDto,
  ): Promise<FunnelDocument> {
    const funnel = await this.funnelModel.findOneAndUpdate(
      { _id: new Types.ObjectId(id), creator: new Types.ObjectId(creatorId) },
      { $set: dto },
      { new: true },
    );
    if (!funnel) throw new NotFoundException('Funnel not found');
    return funnel;
  }

  async remove(id: string, creatorId: string): Promise<void> {
    const result = await this.funnelModel.findOneAndDelete({
      _id: new Types.ObjectId(id),
      creator: new Types.ObjectId(creatorId),
    });
    if (!result) throw new NotFoundException('Funnel not found');
  }

  async getAnalytics(id: string, creatorId: string) {
    const funnel = await this.findOneByCreator(id, creatorId);
    return (
      funnel.analytics ?? {
        totalVisitors: 0,
        totalConversions: 0,
        overallConversionRate: 0,
        revenue: 0,
      }
    );
  }
}
