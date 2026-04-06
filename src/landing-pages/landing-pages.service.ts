import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  LandingPage,
  LandingPageDocument,
} from '../schema/landing-page.schema';
import { Community, CommunityDocument } from '../schema/community.schema';
import { CreateLandingPageDto } from './dto/create-landing-page.dto';
import { UpdateLandingPageDto } from './dto/update-landing-page.dto';
import { PublishLandingPageDto } from './dto/publish-landing-page.dto';

@Injectable()
export class LandingPagesService {
  constructor(
    @InjectModel(LandingPage.name)
    private readonly landingPageModel: Model<LandingPageDocument>,
    @InjectModel(Community.name)
    private readonly communityModel: Model<CommunityDocument>,
  ) {}

  // ─── Slug Helpers ────────────────────────────────────────────────────────────

  private toBaseSlug(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 80);
  }

  async generateUniqueSlug(
    creatorId: string,
    base: string,
    excludeId?: string,
  ): Promise<string> {
    const slug = this.toBaseSlug(base) || 'page';
    let candidate = slug;
    let suffix = 1;

    while (true) {
      const query: Record<string, any> = {
        creator: new Types.ObjectId(creatorId),
        slug: candidate,
      };
      if (excludeId) {
        query._id = { $ne: new Types.ObjectId(excludeId) };
      }

      const exists = await this.landingPageModel.findOne(query).lean();
      if (!exists) return candidate;
      candidate = `${slug}-${suffix++}`;
    }
  }

  // ─── Creator-scoped Queries ──────────────────────────────────────────────────

  async findAllByCreator(creatorId: string): Promise<LandingPageDocument[]> {
    return this.landingPageModel
      .find({ creator: new Types.ObjectId(creatorId) })
      .select('-blocks')
      .sort({ createdAt: -1 })
      .lean<LandingPageDocument[]>();
  }

  async findOneByCreator(
    id: string,
    creatorId: string,
  ): Promise<LandingPageDocument> {
    const page = await this.landingPageModel
      .findOne({
        _id: new Types.ObjectId(id),
        creator: new Types.ObjectId(creatorId),
      })
      .lean<LandingPageDocument>();

    if (!page) {
      throw new NotFoundException(
        `Landing page not found or you do not have access to it`,
      );
    }

    return page;
  }

  // ─── CRUD ────────────────────────────────────────────────────────────────────

  async create(
    creatorId: string,
    dto: CreateLandingPageDto,
  ): Promise<LandingPageDocument> {
    const pageType = dto.pageType || 'standalone';
    const isPrimaryHome =
      pageType === 'community-home' ? true : dto.isPrimaryHome || false;

    // ─── Invariants ──────────────────────────────────────────────────────────
    if (pageType === 'community-home' && !dto.communityId) {
      throw new BadRequestException(
        'communityId is required when pageType is community-home',
      );
    }
    if (isPrimaryHome && pageType !== 'community-home') {
      throw new BadRequestException(
        'isPrimaryHome can only be true when pageType is community-home',
      );
    }
    if (pageType === 'community-home' && dto.communityId) {
      const existingCommunityHome = await this.landingPageModel
        .findOne({
          communityId: new Types.ObjectId(dto.communityId),
          pageType: 'community-home',
        })
        .select('_id')
        .lean();
      if (existingCommunityHome) {
        throw new BadRequestException(
          'This community already has a home page. Edit the existing home page instead.',
        );
      }
    }

    const slugBase = dto.slug || dto.title;
    const slug = await this.generateUniqueSlug(creatorId, slugBase);

    const page = new this.landingPageModel({
      creator: new Types.ObjectId(creatorId),
      title: dto.title,
      slug,
      description: dto.description,
      communityId: dto.communityId
        ? new Types.ObjectId(dto.communityId)
        : undefined,
      pageType,
      isPrimaryHome,
      templateId: dto.templateId,
      seo: dto.seo ?? {},
      status: 'draft',
      blocks: [],
      analytics: {
        views: 0,
        uniqueVisitors: 0,
        conversions: 0,
        conversionRate: 0,
        avgTimeOnPage: 0,
        bounceRate: 0,
      },
    });

    return page.save();
  }

  async update(
    id: string,
    creatorId: string,
    dto: UpdateLandingPageDto,
  ): Promise<LandingPageDocument> {
    // Verify ownership first
    const existing = await this.landingPageModel.findOne({
      _id: new Types.ObjectId(id),
      creator: new Types.ObjectId(creatorId),
    });

    if (!existing) {
      throw new NotFoundException(
        `Landing page not found or you do not have access to it`,
      );
    }

    const updatePayload: Record<string, any> = {};

    // ─── Domain invariants for pageType/isPrimaryHome ──────────────────────
    if (dto.pageType !== undefined && dto.pageType !== existing.pageType) {
      if (dto.pageType === 'community-home' && !existing.communityId) {
        throw new BadRequestException(
          'Cannot set pageType to community-home without a communityId',
        );
      }
    }
    if (
      dto.isPrimaryHome === true &&
      (dto.pageType || existing.pageType) !== 'community-home'
    ) {
      throw new BadRequestException(
        'isPrimaryHome can only be true when pageType is community-home',
      );
    }
    const nextPageType = dto.pageType ?? existing.pageType;
    const nextIsPrimaryHome = dto.isPrimaryHome ?? existing.isPrimaryHome;
    if (nextPageType === 'community-home') {
      if (!existing.communityId) {
        throw new BadRequestException(
          'Cannot keep page as community-home without a communityId',
        );
      }
      if (nextIsPrimaryHome === false) {
        throw new BadRequestException(
          'Community home pages must remain primary for their community',
        );
      }
      const duplicateCommunityHome = await this.landingPageModel
        .findOne({
          communityId: existing.communityId,
          pageType: 'community-home',
          _id: { $ne: existing._id },
        })
        .select('_id')
        .lean();
      if (duplicateCommunityHome) {
        throw new BadRequestException(
          'This community already has another home page. Resolve duplicates before updating.',
        );
      }
      updatePayload.isPrimaryHome = true;
    }

    if (dto.title !== undefined) updatePayload.title = dto.title;
    if (dto.description !== undefined)
      updatePayload.description = dto.description;
    if (dto.blocks !== undefined) updatePayload.blocks = dto.blocks;
    if (dto.seo !== undefined) updatePayload.seo = dto.seo;
    if (dto.favicon !== undefined) updatePayload.favicon = dto.favicon;
    if (dto.thumbnail !== undefined) updatePayload.thumbnail = dto.thumbnail;
    if (dto.settings !== undefined) updatePayload.settings = dto.settings;
    if (dto.pageType !== undefined) updatePayload.pageType = dto.pageType;
    if (dto.isPrimaryHome !== undefined)
      updatePayload.isPrimaryHome = dto.isPrimaryHome;
    if (dto.status !== undefined) updatePayload.status = dto.status;

    // Re-generate slug only when an explicit slug or title change is requested
    if (dto.slug !== undefined) {
      updatePayload.slug = await this.generateUniqueSlug(
        creatorId,
        dto.slug,
        id,
      );
    } else if (dto.title !== undefined && dto.title !== existing.title) {
      // Only auto-regen slug from title when the existing slug was auto-derived
      // (i.e. it still matches the old title's slug pattern). This avoids clobbering
      // a manually set slug when the user only edits the title.
      const derivedFromOldTitle = this.toBaseSlug(existing.title);
      if (existing.slug.startsWith(derivedFromOldTitle)) {
        updatePayload.slug = await this.generateUniqueSlug(
          creatorId,
          dto.title,
          id,
        );
      }
    }

    return this.landingPageModel
      .findByIdAndUpdate(id, { $set: updatePayload }, { new: true })
      .lean<LandingPageDocument>() as Promise<LandingPageDocument>;
  }

  async publish(
    id: string,
    creatorId: string,
    dto: PublishLandingPageDto,
  ): Promise<LandingPageDocument> {
    const existing = await this.landingPageModel.findOne({
      _id: new Types.ObjectId(id),
      creator: new Types.ObjectId(creatorId),
    });

    if (!existing) {
      throw new NotFoundException(
        `Landing page not found or you do not have access to it`,
      );
    }

    // ─── Community-home publish guard: ensure community-join block ────────
    if (existing.pageType === 'community-home') {
      const blocks = existing.blocks || [];
      const hasCommunityJoin = blocks.some(
        (b: any) => b.type === 'community-join' && b.visible !== false,
      );
      if (!hasCommunityJoin) {
        // Auto-inject community-join block after hero (or at index 1, or at end)
        const heroIdx = blocks.findIndex((b: any) => b.type === 'hero');
        const insertIdx =
          heroIdx >= 0 ? heroIdx + 1 : Math.min(1, blocks.length);
        const now = Date.now();
        const joinBlock = {
          id: `auto-join-${now}`,
          type: 'community-join',
          content: {
            headline: 'Join Our Community',
            subheadline: 'Get access to exclusive content.',
            communityId: existing.communityId?.toString(),
            showPricing: true,
            showMemberCount: true,
            showRating: true,
            ctaText: 'Join Now',
            ctaUrl: '#join',
          },
          style: {
            backgroundColor: '#f8f7ff',
            textColor: '#1a1a2e',
            padding: { top: 60, right: 20, bottom: 60, left: 20 },
          },
          visible: true,
        };
        blocks.splice(insertIdx, 0, joinBlock);
        await this.landingPageModel.findByIdAndUpdate(id, {
          $set: { blocks },
        });
      }
    }

    const updatePayload: Record<string, any> = {
      status: 'published',
      publishedAt: new Date(),
    };

    if (dto.customDomain !== undefined) {
      updatePayload.customDomain = dto.customDomain || null;
    }

    if (dto.passwordProtected !== undefined || dto.password !== undefined) {
      updatePayload['settings.passwordProtected'] =
        dto.passwordProtected ?? existing.settings?.passwordProtected ?? false;
      if (dto.password !== undefined) {
        updatePayload['settings.password'] = dto.password;
      }
    }

    return this.landingPageModel
      .findByIdAndUpdate(id, { $set: updatePayload }, { new: true })
      .lean<LandingPageDocument>() as Promise<LandingPageDocument>;
  }

  async unpublish(id: string, creatorId: string): Promise<LandingPageDocument> {
    const existing = await this.landingPageModel.findOne({
      _id: new Types.ObjectId(id),
      creator: new Types.ObjectId(creatorId),
    });

    if (!existing) {
      throw new NotFoundException(
        `Landing page not found or you do not have access to it`,
      );
    }

    return this.landingPageModel
      .findByIdAndUpdate(id, { $set: { status: 'draft' } }, { new: true })
      .lean<LandingPageDocument>() as Promise<LandingPageDocument>;
  }

  async duplicate(id: string, creatorId: string): Promise<LandingPageDocument> {
    const original = await this.landingPageModel.findOne({
      _id: new Types.ObjectId(id),
      creator: new Types.ObjectId(creatorId),
    });

    if (!original) {
      throw new NotFoundException(
        `Landing page not found or you do not have access to it`,
      );
    }
    if (original.pageType === 'community-home') {
      throw new BadRequestException(
        'Community home pages cannot be duplicated. Each community has a single home page.',
      );
    }

    const copyTitle = `${original.title} (Copy)`;
    const slug = await this.generateUniqueSlug(creatorId, copyTitle);

    const copy = new this.landingPageModel({
      creator: new Types.ObjectId(creatorId),
      communityId: original.communityId,
      pageType: original.pageType,
      isPrimaryHome: false, // Duplicates are never primary
      title: copyTitle,
      slug,
      description: original.description,
      status: 'draft',
      blocks: original.blocks ?? [],
      seo: original.seo ?? {},
      favicon: original.favicon,
      thumbnail: original.thumbnail,
      settings: {
        passwordProtected: false,
        trackingPixels: original.settings?.trackingPixels,
      },
      analytics: {
        views: 0,
        uniqueVisitors: 0,
        conversions: 0,
        conversionRate: 0,
        avgTimeOnPage: 0,
        bounceRate: 0,
      },
    });

    return copy.save();
  }

  async remove(id: string, creatorId: string): Promise<void> {
    const result = await this.landingPageModel.findOneAndDelete({
      _id: new Types.ObjectId(id),
      creator: new Types.ObjectId(creatorId),
    });

    if (!result) {
      throw new NotFoundException(
        `Landing page not found or you do not have access to it`,
      );
    }

    // If this was a community-home page, clear the community's homePageId
    if (result.pageType === 'community-home' && result.communityId) {
      await this.communityModel.updateOne(
        { _id: result.communityId, homePageId: result._id },
        { $unset: { homePageId: 1 } },
      );
    }
  }

  // ─── Community Home Page Methods ──────────────────────────────────────────────

  /**
   * Get the community home page for a given community ID
   */
  async getCommunityHomePage(
    communityId: string,
  ): Promise<LandingPageDocument | null> {
    return this.landingPageModel
      .findOne({
        communityId: new Types.ObjectId(communityId),
        pageType: 'community-home',
        isPrimaryHome: true,
      })
      .lean<LandingPageDocument>();
  }

  /**
   * Get the community home page by community slug (public)
   */
  async getCommunityHomePageBySlug(
    slug: string,
  ): Promise<{ page: LandingPageDocument; community: any } | null> {
    const community = await this.communityModel
      .findOne({ slug, isActive: true })
      .lean();

    if (!community) return null;

    // Try homePageId first for fast lookup
    if (community.homePageId) {
      const page = await this.landingPageModel
        .findOne({
          _id: community.homePageId,
          communityId: community._id,
          pageType: 'community-home',
          isPrimaryHome: true,
          status: 'published',
        })
        .lean<LandingPageDocument>();

      if (page) return { page, community };
    }

    // Fallback to query by community + primary flag
    const page = await this.landingPageModel
      .findOne({
        communityId: community._id,
        pageType: 'community-home',
        isPrimaryHome: true,
        status: 'published',
      })
      .lean<LandingPageDocument>();

    if (!page) return null;

    return { page, community };
  }

  /**
   * Assign a landing page as the primary community home page
   */
  async assignAsCommunityHome(
    pageId: string,
    communityId: string,
    userId: string,
  ): Promise<LandingPageDocument> {
    // Verify the page belongs to this creator
    const page = await this.landingPageModel.findOne({
      _id: new Types.ObjectId(pageId),
      creator: new Types.ObjectId(userId),
    });

    if (!page) {
      throw new NotFoundException(
        'Landing page not found or you do not have access to it',
      );
    }

    // Verify the community belongs to this creator
    const community = await this.communityModel.findOne({
      _id: new Types.ObjectId(communityId),
      createur: new Types.ObjectId(userId),
    });

    if (!community) {
      throw new NotFoundException(
        'Community not found or you do not have access to it',
      );
    }

    // Unset any existing primary home page for this community
    await this.landingPageModel.updateMany(
      {
        communityId: new Types.ObjectId(communityId),
        isPrimaryHome: true,
        _id: { $ne: new Types.ObjectId(pageId) },
      },
      { $set: { isPrimaryHome: false } },
    );

    // Set this page as primary home
    const updated = await this.landingPageModel
      .findByIdAndUpdate(
        pageId,
        {
          $set: {
            communityId: new Types.ObjectId(communityId),
            pageType: 'community-home',
            isPrimaryHome: true,
          },
        },
        { new: true },
      )
      .lean<LandingPageDocument>();

    // Update community's homePageId
    await this.communityModel.findByIdAndUpdate(communityId, {
      $set: { homePageId: new Types.ObjectId(pageId) },
    });

    return updated as LandingPageDocument;
  }

  /**
   * Create or get a community home page draft
   */
  async createOrGetCommunityHomeDraft(
    communityId: string,
    userId: string,
  ): Promise<LandingPageDocument> {
    // Verify community ownership
    const community = await this.communityModel.findOne({
      _id: new Types.ObjectId(communityId),
      createur: new Types.ObjectId(userId),
    });

    if (!community) {
      throw new NotFoundException(
        'Community not found or you do not have access to it',
      );
    }

    // Check if a home page already exists
    const existing = await this.landingPageModel.findOne({
      communityId: new Types.ObjectId(communityId),
      pageType: 'community-home',
      isPrimaryHome: true,
    });

    if (existing) return existing;

    // Create a new draft home page
    const slug = await this.generateUniqueSlug(
      userId,
      `${community.name}-home`,
    );

    const homePage = new this.landingPageModel({
      creator: new Types.ObjectId(userId),
      communityId: new Types.ObjectId(communityId),
      pageType: 'community-home',
      isPrimaryHome: true,
      title: `${community.name} - Home Page`,
      slug,
      description: community.short_description || '',
      status: 'draft',
      blocks: this.getDefaultCommunityHomeBlocks(community),
      seo: {
        title: community.name,
        description: community.short_description || '',
      },
      analytics: {
        views: 0,
        uniqueVisitors: 0,
        conversions: 0,
        conversionRate: 0,
        avgTimeOnPage: 0,
        bounceRate: 0,
      },
    });

    const saved = await homePage.save();

    // Update community with homePageId
    await this.communityModel.findByIdAndUpdate(communityId, {
      $set: { homePageId: saved._id },
    });

    return saved;
  }

  /**
   * Get all community home pages for a creator
   */
  async findCommunityHomePagesByCreator(creatorId: string): Promise<any[]> {
    const homePages = await this.landingPageModel
      .find({
        creator: new Types.ObjectId(creatorId),
        pageType: 'community-home',
        isPrimaryHome: true,
      })
      .select('-blocks')
      .sort({ updatedAt: -1 })
      .lean();

    // Enrich with community info
    const communityIds = homePages
      .filter((p) => p.communityId)
      .map((p) => p.communityId);

    const communities = await this.communityModel
      .find({ _id: { $in: communityIds } })
      .select(
        'name slug logo photo_de_couverture short_description membersCount priceType',
      )
      .lean();

    const communityMap = new Map(
      communities.map((c: any) => [c._id.toString(), c]),
    );

    return homePages.map((page) => ({
      ...page,
      community: page.communityId
        ? communityMap.get(page.communityId.toString()) || null
        : null,
    }));
  }

  /**
   * Generate default community home blocks from community data
   */
  private getDefaultCommunityHomeBlocks(community: any): Record<string, any>[] {
    const now = Date.now();
    return [
      {
        id: `block-${now}-hero`,
        type: 'hero',
        content: {
          headline: community.name || 'Welcome to Our Community',
          subheadline:
            community.short_description ||
            'Join a thriving community of learners and creators.',
          ctaText: 'Join Now',
          ctaUrl: '#join',
          backgroundImage: community.photo_de_couverture || '',
        },
        style: {
          backgroundColor: '#0f0a2e',
          textColor: '#ffffff',
          padding: { top: 80, right: 20, bottom: 80, left: 20 },
        },
        visible: true,
      },
      {
        id: `block-${now}-join`,
        type: 'community-join',
        content: {
          headline: 'Join Our Community',
          subheadline:
            'Get access to exclusive content, resources, and a supportive network.',
          communityId: community._id.toString(),
          communitySlug: community.slug,
          communityName: community.name,
          showPricing: true,
          showMemberCount: true,
          showRating: true,
          ctaText: 'Join Now',
          ctaUrl: '#join',
        },
        style: {
          backgroundColor: '#f8f7ff',
          textColor: '#1a1a2e',
          padding: { top: 60, right: 20, bottom: 60, left: 20 },
        },
        visible: true,
      },
      {
        id: `block-${now}-features`,
        type: 'features',
        content: {
          headline: 'What You Get',
          subheadline: 'Everything included in your membership',
          features: (community.settings?.features || [])
            .slice(0, 6)
            .map((f: string, i: number) => ({
              title: f,
              description: '',
              icon: '✨',
            })) || [
            {
              title: 'Exclusive Content',
              description: 'Access premium resources and materials',
              icon: '📚',
            },
            {
              title: 'Live Sessions',
              description: 'Weekly Q&A and workshops',
              icon: '🎥',
            },
            {
              title: 'Community',
              description: 'Connect with like-minded individuals',
              icon: '🤝',
            },
          ],
        },
        style: {
          backgroundColor: '#ffffff',
          textColor: '#1a1a2e',
          padding: { top: 60, right: 20, bottom: 60, left: 20 },
        },
        visible: true,
      },
      {
        id: `block-${now}-cta`,
        type: 'cta',
        content: {
          headline: 'Ready to Get Started?',
          subheadline: `Join ${community.name} and start your journey today.`,
          ctaText: 'Join Community Now',
          ctaUrl: '#join',
        },
        style: {
          backgroundColor: '#f8f7ff',
          textColor: '#1a1a2e',
          padding: { top: 60, right: 20, bottom: 60, left: 20 },
        },
        visible: true,
      },
    ];
  }

  // ─── Public Lookups ──────────────────────────────────────────────────────────

  async findPublicPage(
    slug: string,
    creatorId?: string,
  ): Promise<LandingPageDocument> {
    const query: Record<string, any> = { slug, status: 'published' };
    if (creatorId) {
      query.creator = new Types.ObjectId(creatorId);
    }
    const page = await this.landingPageModel
      .findOne(query)
      .lean<LandingPageDocument>();

    if (!page) {
      throw new NotFoundException(`Landing page not found`);
    }

    return page;
  }

  async findPublicPageByCreatorSlug(
    slug: string,
    _creatorSlug: string,
  ): Promise<LandingPageDocument> {
    // For now, fall back to slug-only lookup since we don't have User service injected.
    // In a future iteration, look up the creator by their slug/handle first.
    return this.findPublicPage(slug);
  }

  async findPublicPageById(id: string): Promise<LandingPageDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Landing page not found`);
    }

    const page = await this.landingPageModel
      .findOne({
        _id: new Types.ObjectId(id),
        status: 'published',
      })
      .lean<LandingPageDocument>();

    if (!page) {
      throw new NotFoundException(`Landing page not found`);
    }

    return page;
  }
}
