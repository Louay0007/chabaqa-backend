import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import { AffiliateProgram, AffiliateProgramDocument } from './schemas/affiliate-program.schema';
import { AffiliatePartner, AffiliatePartnerDocument } from './schemas/affiliate-partner.schema';
import { AffiliateLink, AffiliateLinkDocument } from './schemas/affiliate-link.schema';
import { AffiliateClick, AffiliateClickDocument } from './schemas/affiliate-click.schema';
import { AffiliateConversion, AffiliateConversionDocument } from './schemas/affiliate-conversion.schema';
import { CreateProgramDto, UpdateProgramDto, InvitePartnerDto, CreateLinkDto } from './dto/affiliate.dto';

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function generateBase62(length = 8): string {
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += BASE62[bytes[i] % 62];
  }
  return result;
}

@Injectable()
export class AffiliateService {
  private readonly logger = new Logger(AffiliateService.name);

  constructor(
    @InjectModel(AffiliateProgram.name) private readonly programModel: Model<AffiliateProgramDocument>,
    @InjectModel(AffiliatePartner.name) private readonly partnerModel: Model<AffiliatePartnerDocument>,
    @InjectModel(AffiliateLink.name) private readonly linkModel: Model<AffiliateLinkDocument>,
    @InjectModel(AffiliateClick.name) private readonly clickModel: Model<AffiliateClickDocument>,
    @InjectModel(AffiliateConversion.name) private readonly conversionModel: Model<AffiliateConversionDocument>,
    @InjectModel('User') private readonly userModel: Model<any>,
  ) {}

  // ── Program CRUD (Creator) ──

  async createProgram(creatorId: string, dto: CreateProgramDto): Promise<AffiliateProgramDocument> {
    if (dto.scopeType === 'community' && !dto.communityId) {
      throw new BadRequestException('communityId is required for community-scoped programs');
    }
    const program = await this.programModel.create({
      creatorId: new Types.ObjectId(creatorId),
      communityId: dto.communityId ? new Types.ObjectId(dto.communityId) : undefined,
      scopeType: dto.scopeType,
      scopeContentType: dto.scopeContentType,
      scopeContentId: dto.scopeContentId,
      commissionPercent: dto.commissionPercent,
      cookieWindowDays: dto.cookieWindowDays ?? Number(process.env.AFFILIATE_DEFAULT_COOKIE_DAYS || 30),
      holdDays: dto.holdDays ?? Number(process.env.AFFILIATE_DEFAULT_HOLD_DAYS || 14),
      status: 'active',
    });

    // Ensure creators can generate and use their own referral links without
    // requiring a separate partner invite/approval flow.
    await this.partnerModel.findOneAndUpdate(
      {
        programId: program._id,
        partnerUserId: new Types.ObjectId(creatorId),
      },
      {
        $setOnInsert: {
          status: 'approved',
          approvedAt: new Date(),
          approvedBy: new Types.ObjectId(creatorId),
        },
      },
      { upsert: true, new: true },
    );

    return program;
  }

  async getCreatorPrograms(creatorId: string): Promise<AffiliateProgramDocument[]> {
    return this.programModel.find({ creatorId: new Types.ObjectId(creatorId) }).sort({ createdAt: -1 });
  }

  async updateProgram(creatorId: string, programId: string, dto: UpdateProgramDto): Promise<AffiliateProgramDocument> {
    const program = await this.programModel.findOne({
      _id: new Types.ObjectId(programId),
      creatorId: new Types.ObjectId(creatorId),
    });
    if (!program) throw new NotFoundException('Program not found');

    if (dto.commissionPercent !== undefined) program.commissionPercent = dto.commissionPercent;
    if (dto.status !== undefined) program.status = dto.status;
    if (dto.cookieWindowDays !== undefined) program.cookieWindowDays = dto.cookieWindowDays;
    if (dto.holdDays !== undefined) program.holdDays = dto.holdDays;

    return program.save();
  }

  // ── Partner management (Creator) ──

  async invitePartner(
    creatorId: string,
    programId: string,
    dto: InvitePartnerDto,
  ): Promise<AffiliatePartnerDocument> {
    const program = await this.programModel.findOne({
      _id: new Types.ObjectId(programId),
      creatorId: new Types.ObjectId(creatorId),
    });
    if (!program) throw new NotFoundException('Program not found');

    let targetUserId: string | undefined = dto.userId;
    if (!targetUserId && dto.email) {
      const user = await this.userModel.findOne({ email: dto.email }).select('_id');
      if (!user) throw new BadRequestException('No user found with that email');
      targetUserId = user._id.toString();
    }
    if (!targetUserId) throw new BadRequestException('Provide userId or email');

    if (targetUserId === creatorId) {
      throw new BadRequestException('Cannot invite yourself as partner');
    }

    const existing = await this.partnerModel.findOne({
      programId: program._id,
      partnerUserId: new Types.ObjectId(targetUserId),
    });
    if (existing) {
      if (existing.status === 'rejected') {
        existing.status = 'pending';
        return existing.save();
      }
      throw new BadRequestException('Partner already exists for this program');
    }

    return this.partnerModel.create({
      programId: program._id,
      partnerUserId: new Types.ObjectId(targetUserId),
      status: 'pending',
    });
  }

  async updatePartnerStatus(
    creatorId: string,
    partnerId: string,
    status: 'approved' | 'rejected' | 'paused',
    approvedById?: string,
  ): Promise<AffiliatePartnerDocument> {
    const partner = await this.partnerModel.findById(partnerId).populate('programId');
    if (!partner) throw new NotFoundException('Partner not found');

    const program = partner.programId as any as AffiliateProgramDocument;
    if (program.creatorId.toString() !== creatorId) {
      throw new ForbiddenException('Not the program owner');
    }

    partner.status = status;
    if (status === 'approved') {
      partner.approvedAt = new Date();
      partner.approvedBy = new Types.ObjectId(approvedById || creatorId);
    }
    return partner.save();
  }

  async getCreatorPartners(creatorId: string, programId?: string): Promise<AffiliatePartnerDocument[]> {
    const programIds = programId
      ? [new Types.ObjectId(programId)]
      : (await this.programModel.find({ creatorId: new Types.ObjectId(creatorId) }).select('_id'))
          .map((p) => p._id);
    return this.partnerModel.find({ programId: { $in: programIds } }).populate('partnerUserId', 'name email');
  }

  // ── Link management ──

  async createLink(creatorId: string, dto: CreateLinkDto): Promise<AffiliateLinkDocument> {
    const program = await this.programModel.findOne({
      _id: new Types.ObjectId(dto.programId),
      creatorId: new Types.ObjectId(creatorId),
    });
    if (!program) throw new NotFoundException('Program not found');

    let partnerUserId = dto.partnerUserId || creatorId;

    if (!dto.partnerUserId) {
      await this.partnerModel.findOneAndUpdate(
        {
          programId: program._id,
          partnerUserId: new Types.ObjectId(creatorId),
        },
        {
          $set: {
            status: 'approved',
            approvedAt: new Date(),
            approvedBy: new Types.ObjectId(creatorId),
          },
        },
        { upsert: true, new: true },
      );
      partnerUserId = creatorId;
    } else {
      const partner = await this.partnerModel.findOne({
        programId: program._id,
        partnerUserId: new Types.ObjectId(partnerUserId),
        status: 'approved',
      });
      if (!partner) throw new BadRequestException('Partner not approved for this program');
    }

    if (!dto.targetPath.startsWith('/')) {
      throw new BadRequestException('targetPath must start with /');
    }

    const code = generateBase62(8);
    return this.linkModel.create({
      programId: program._id,
      partnerUserId: new Types.ObjectId(partnerUserId),
      code,
      targetPath: dto.targetPath,
      targetContentType: dto.targetContentType,
      targetContentId: dto.targetContentId,
      communityId: dto.communityId ? new Types.ObjectId(dto.communityId) : program.communityId,
      creatorId: program.creatorId,
    });
  }

  async createPartnerLink(
    partnerUserId: string,
    dto: { programId: string; targetPath: string; targetContentType?: any; targetContentId?: string; communityId?: string },
  ): Promise<AffiliateLinkDocument> {
    const partner = await this.partnerModel.findOne({
      programId: new Types.ObjectId(dto.programId),
      partnerUserId: new Types.ObjectId(partnerUserId),
      status: 'approved',
    });
    if (!partner) throw new BadRequestException('You are not an approved partner for this program');

    const program = await this.programModel.findById(dto.programId);
    if (!program || program.status !== 'active') throw new BadRequestException('Program not active');

    if (!dto.targetPath.startsWith('/')) {
      throw new BadRequestException('targetPath must start with /');
    }

    const code = generateBase62(8);
    return this.linkModel.create({
      programId: program._id,
      partnerUserId: new Types.ObjectId(partnerUserId),
      code,
      targetPath: dto.targetPath,
      targetContentType: dto.targetContentType,
      targetContentId: dto.targetContentId,
      communityId: dto.communityId ? new Types.ObjectId(dto.communityId) : program.communityId,
      creatorId: program.creatorId,
    });
  }

  async getPartnerLinks(partnerUserId: string): Promise<AffiliateLinkDocument[]> {
    return this.linkModel.find({ partnerUserId: new Types.ObjectId(partnerUserId) });
  }

  async getPartnerPrograms(partnerUserId: string): Promise<any[]> {
    const partners = await this.partnerModel
      .find({ partnerUserId: new Types.ObjectId(partnerUserId), status: 'approved' })
      .populate('programId');
    return partners.map((p) => ({ partner: p, program: p.programId }));
  }

  // ── Link resolution (public redirect) ──

  async resolveLink(code: string): Promise<{
    link: AffiliateLinkDocument;
    program: AffiliateProgramDocument;
    partner: AffiliatePartnerDocument;
  } | null> {
    const link = await this.linkModel.findOne({ code });
    if (!link) return null;

    const program = await this.programModel.findById(link.programId);
    if (!program || program.status !== 'active') return null;

    const partner = await this.partnerModel.findOne({
      programId: program._id,
      partnerUserId: link.partnerUserId,
      status: 'approved',
    });
    if (!partner) return null;

    return { link, program, partner };
  }

  // ── Stats ──

  async getCreatorStats(creatorId: string): Promise<any> {
    const programIds = (await this.programModel.find({ creatorId: new Types.ObjectId(creatorId) }).select('_id'))
      .map((p) => p._id);

    const [clicks, conversions, revenue, topPartners] = await Promise.all([
      this.clickModel.countDocuments({ programId: { $in: programIds } }),
      this.conversionModel.countDocuments({ programId: { $in: programIds } }),
      this.conversionModel.aggregate([
        { $match: { programId: { $in: programIds }, status: { $in: ['pending', 'approved', 'paid'] } } },
        { $group: { _id: null, totalCommissionDT: { $sum: '$commissionDT' }, totalRevenueDT: { $sum: '$amountDT' } } },
      ]),
      this.conversionModel.aggregate([
        { $match: { programId: { $in: programIds }, status: { $in: ['pending', 'approved', 'paid'] } } },
        { $group: { _id: '$partnerUserId', commissionDT: { $sum: '$commissionDT' }, conversions: { $sum: 1 } } },
        { $sort: { commissionDT: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user',
          },
        },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        { $project: { partnerUserId: '$_id', name: '$user.name', email: '$user.email', commissionDT: 1, conversions: 1 } },
      ]),
    ]);

    const revenueData = revenue[0] || { totalCommissionDT: 0, totalRevenueDT: 0 };
    return {
      clicks,
      conversions,
      totalCommissionDT: revenueData.totalCommissionDT,
      totalRevenueDT: revenueData.totalRevenueDT,
      topPartners,
    };
  }

  async getPartnerStats(partnerUserId: string, from?: string, to?: string): Promise<any> {
    const dateFilter: any = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) dateFilter.$lte = new Date(to);

    const matchFilter: any = { partnerUserId: new Types.ObjectId(partnerUserId) };
    if (from || to) matchFilter.createdAt = dateFilter;

    const [clicks, conversions] = await Promise.all([
      this.clickModel.countDocuments(matchFilter),
      this.conversionModel.aggregate([
        { $match: { ...matchFilter, status: { $in: ['pending', 'approved', 'paid'] } } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalDT: { $sum: '$commissionDT' },
          },
        },
      ]),
    ]);

    const byStatus: Record<string, { count: number; totalDT: number }> = {};
    for (const c of conversions) {
      byStatus[c._id] = { count: c.count, totalDT: c.totalDT };
    }

    return {
      clicks,
      conversions: byStatus,
      totalConversions: Object.values(byStatus).reduce((s, v) => s + v.count, 0),
      totalCommissionDT: Object.values(byStatus).reduce((s, v) => s + v.totalDT, 0),
    };
  }
}
