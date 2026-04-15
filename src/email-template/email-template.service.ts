import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CrmEmailTemplate, EmailTemplateDocument, EmailTemplateCategory } from '../schema/email-template.schema';

@Injectable()
export class EmailTemplateService {
  constructor(
    @InjectModel(CrmEmailTemplate.name)
    private readonly templateModel: Model<EmailTemplateDocument>,
  ) {}

  async create(creatorId: string | Types.ObjectId, dto: {
    communityId: string;
    name: string;
    category?: EmailTemplateCategory;
    subject: string;
    content: string;
    thumbnail?: string;
    variables?: string[];
    isGlobal?: boolean;
  }): Promise<EmailTemplateDocument> {
    return this.templateModel.create({
      communityId: new Types.ObjectId(dto.communityId),
      creatorId: new Types.ObjectId(creatorId.toString()),
      name: dto.name,
      category: dto.category || EmailTemplateCategory.CUSTOM,
      subject: dto.subject,
      content: dto.content,
      thumbnail: dto.thumbnail,
      variables: dto.variables || [],
      isGlobal: dto.isGlobal || false,
    });
  }

  async list(communityId: string | Types.ObjectId): Promise<EmailTemplateDocument[]> {
    return this.templateModel
      .find({
        $or: [
          { communityId: new Types.ObjectId(communityId.toString()) },
          { isGlobal: true },
        ],
      })
      .sort({ createdAt: -1 });
  }

  async findOne(communityId: string | Types.ObjectId, id: string): Promise<EmailTemplateDocument> {
    const template = await this.templateModel.findOne({
      _id: id,
      $or: [
        { communityId: new Types.ObjectId(communityId.toString()) },
        { isGlobal: true },
      ],
    });
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  async update(id: string, patch: Partial<Pick<CrmEmailTemplate, 'name' | 'category' | 'subject' | 'content' | 'thumbnail' | 'variables'>>): Promise<EmailTemplateDocument> {
    const template = await this.templateModel.findByIdAndUpdate(id, { $set: patch }, { new: true });
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  async delete(id: string): Promise<void> {
    await this.templateModel.findByIdAndDelete(id);
  }

  async incrementUsage(id: string): Promise<EmailTemplateDocument> {
    const template = await this.templateModel.findByIdAndUpdate(
      id,
      { $inc: { usageCount: 1 } },
      { new: true },
    );
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }
}
