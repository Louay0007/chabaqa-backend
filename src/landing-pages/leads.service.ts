import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, FilterQuery } from 'mongoose';
import { Lead, LeadDocument } from '../schema/lead.schema';
import { LandingPage, LandingPageDocument } from '../schema/landing-page.schema';
import { SubmitLeadDto } from './dto/submit-lead.dto';

export interface LeadQueryParams {
  page?: number;
  limit?: number;
  score?: number;
  source?: string;
  search?: string;
  status?: 'new' | 'contacted' | 'converted';
}

export interface PaginatedLeadsResult {
  success: boolean;
  data: LeadDocument[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ExportResult {
  content: string;
  filename: string;
  mimeType: string;
}

@Injectable()
export class LeadsService {
  constructor(
    @InjectModel(Lead.name)
    private readonly leadModel: Model<LeadDocument>,
    @InjectModel(LandingPage.name)
    private readonly landingPageModel: Model<LandingPageDocument>,
  ) {}

  // ─── Scoring ─────────────────────────────────────────────────────────────────

  calculateScore(dto: SubmitLeadDto): number {
    let score = 50;

    if (dto.email) score += 20;
    if (dto.phone) score += 15;

    // Extra fields beyond the core three (email, name, phone) add up to +15
    const coreFields = new Set(['email', 'name', 'phone', 'source']);
    const extraFields = Object.keys(dto.data ?? {}).filter(
      (k) => !coreFields.has(k),
    );
    if (extraFields.length > 0) {
      // Scale +15 across extra fields (max +15 regardless of count)
      score += Math.min(15, extraFields.length * 5);
    }

    return Math.min(100, score);
  }

  // ─── Submit ──────────────────────────────────────────────────────────────────

  async submit(
    pageId: string,
    dto: SubmitLeadDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<LeadDocument> {
    const page = await this.landingPageModel
      .findOne({
        _id: new Types.ObjectId(pageId),
        status: 'published',
      })
      .select('creator communityId pageType isPrimaryHome')
      .lean<LandingPageDocument>();

    if (!page) {
      throw new NotFoundException('Landing page not found or is not published');
    }

    const score = this.calculateScore(dto);

    const lead = new this.leadModel({
      landingPage: new Types.ObjectId(pageId),
      creator: page.creator,
      communityId: page.communityId || undefined,
      homePageId:
        page.pageType === 'community-home' && page.isPrimaryHome
          ? new Types.ObjectId(pageId)
          : undefined,
      pageType: page.pageType || 'standalone',
      email: dto.email,
      name: dto.name,
      phone: dto.phone,
      data: dto.data,
      score,
      source: dto.source,
      status: 'new',
      ipAddress,
      userAgent,
    });

    const savedLead = await lead.save();

    // Increment conversions counter and recalculate conversionRate
    await this.landingPageModel.findByIdAndUpdate(pageId, {
      $inc: { 'analytics.conversions': 1 },
    });

    // Recalculate conversionRate asynchronously (fire-and-forget)
    this.recalculateConversionRate(pageId).catch(() => {
      // Non-critical – silently ignore
    });

    return savedLead;
  }

  private async recalculateConversionRate(pageId: string): Promise<void> {
    const page = await this.landingPageModel
      .findById(pageId)
      .select('analytics')
      .lean<LandingPageDocument>();

    if (!page) return;

    const { views, conversions } = page.analytics ?? { views: 0, conversions: 0 };
    const conversionRate =
      views > 0 ? Math.min(100, (conversions / views) * 100) : 0;

    await this.landingPageModel.findByIdAndUpdate(pageId, {
      $set: { 'analytics.conversionRate': parseFloat(conversionRate.toFixed(2)) },
    });
  }

  // ─── List / Paginate ─────────────────────────────────────────────────────────

  async getByPage(
    pageId: string,
    creatorId: string,
    params: LeadQueryParams,
  ): Promise<PaginatedLeadsResult> {
    // Verify ownership
    const page = await this.landingPageModel
      .findOne({
        _id: new Types.ObjectId(pageId),
        creator: new Types.ObjectId(creatorId),
      })
      .lean<LandingPageDocument>();

    if (!page) {
      throw new NotFoundException('Landing page not found or you do not have access to it');
    }

    const pageNum = Math.max(1, Number(params.page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(params.limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    const filter: FilterQuery<LeadDocument> = {
      landingPage: new Types.ObjectId(pageId),
    };

    if (params.status) {
      filter.status = params.status;
    }

    if (params.source) {
      filter.source = params.source;
    }

    if (params.score !== undefined) {
      filter.score = { $gte: Number(params.score) };
    }

    if (params.search) {
      const escaped = params.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      filter.$or = [
        { name: regex },
        { email: regex },
        { phone: regex },
      ];
    }

    const [leads, total] = await Promise.all([
      this.leadModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean<LeadDocument[]>(),
      this.leadModel.countDocuments(filter),
    ]);

    return {
      success: true,
      data: leads,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  // ─── Export ──────────────────────────────────────────────────────────────────

  async exportLeads(
    pageId: string,
    creatorId: string,
    format: 'csv' | 'json' = 'csv',
  ): Promise<ExportResult> {
    // Verify ownership
    const page = await this.landingPageModel
      .findOne({
        _id: new Types.ObjectId(pageId),
        creator: new Types.ObjectId(creatorId),
      })
      .lean<LandingPageDocument>();

    if (!page) {
      throw new NotFoundException('Landing page not found or you do not have access to it');
    }

    const leads = await this.leadModel
      .find({ landingPage: new Types.ObjectId(pageId) })
      .sort({ createdAt: -1 })
      .lean<LeadDocument[]>();

    const timestamp = new Date().toISOString().split('T')[0];
    const safeSlug = String(
      (page as any).slug ?? pageId,
    ).replace(/[^a-z0-9-]/g, '_');

    if (format === 'json') {
      const jsonArray = leads.map((lead) => ({
        id: String((lead as any)._id),
        name: lead.name ?? '',
        email: lead.email ?? '',
        phone: lead.phone ?? '',
        score: lead.score,
        source: lead.source ?? '',
        status: lead.status,
        createdAt: lead.createdAt ? lead.createdAt.toISOString() : '',
        ...this.flattenData(lead.data),
      }));

      return {
        content: JSON.stringify(jsonArray, null, 2),
        filename: `leads-${safeSlug}-${timestamp}.json`,
        mimeType: 'application/json',
      };
    }

    // ── CSV ──
    // Collect all unique extra-data keys across all leads
    const extraKeys = new Set<string>();
    for (const lead of leads) {
      for (const key of Object.keys(lead.data ?? {})) {
        extraKeys.add(key);
      }
    }
    const sortedExtraKeys = Array.from(extraKeys).sort();

    const coreHeaders = ['id', 'name', 'email', 'phone', 'score', 'source', 'status', 'createdAt'];
    const dataHeaders = sortedExtraKeys.map((k) => `data_${k}`);
    const headers = [...coreHeaders, ...dataHeaders];

    const csvRows: string[] = [headers.join(',')];

    for (const lead of leads) {
      const row: string[] = [
        this.csvEscape(String((lead as any)._id)),
        this.csvEscape(lead.name ?? ''),
        this.csvEscape(lead.email ?? ''),
        this.csvEscape(lead.phone ?? ''),
        String(lead.score),
        this.csvEscape(lead.source ?? ''),
        this.csvEscape(lead.status),
        this.csvEscape(
          lead.createdAt ? lead.createdAt.toISOString() : '',
        ),
        ...sortedExtraKeys.map((k) =>
          this.csvEscape(
            lead.data?.[k] !== undefined ? String(lead.data[k]) : '',
          ),
        ),
      ];
      csvRows.push(row.join(','));
    }

    return {
      content: csvRows.join('\n'),
      filename: `leads-${safeSlug}-${timestamp}.csv`,
      mimeType: 'text/csv',
    };
  }

  // ─── Delete ──────────────────────────────────────────────────────────────────

  async deleteLead(
    pageId: string,
    leadId: string,
    creatorId: string,
  ): Promise<void> {
    // Verify that the landing page belongs to this creator
    const page = await this.landingPageModel
      .findOne({
        _id: new Types.ObjectId(pageId),
        creator: new Types.ObjectId(creatorId),
      })
      .lean<LandingPageDocument>();

    if (!page) {
      throw new NotFoundException('Landing page not found or you do not have access to it');
    }

    const result = await this.leadModel.findOneAndDelete({
      _id: new Types.ObjectId(leadId),
      landingPage: new Types.ObjectId(pageId),
    });

    if (!result) {
      throw new NotFoundException('Lead not found');
    }

    // Decrement conversion counter only for "converted" status leads
    if (result.status === 'converted') {
      await this.landingPageModel.findByIdAndUpdate(pageId, {
        $inc: { 'analytics.conversions': -1 },
      });
      this.recalculateConversionRate(pageId).catch(() => {});
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private csvEscape(value: string): string {
    if (/[",\n\r]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private flattenData(data: Record<string, any>): Record<string, any> {
    const flat: Record<string, any> = {};
    for (const [key, value] of Object.entries(data ?? {})) {
      flat[`data_${key}`] =
        value !== null && typeof value === 'object'
          ? JSON.stringify(value)
          : value;
    }
    return flat;
  }
}
