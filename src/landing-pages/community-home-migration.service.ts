import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  LandingPage,
  LandingPageDocument,
} from '../schema/landing-page.schema';
import {
  CommunityPageContent,
  CommunityPageContentDocument,
} from '../schema/community-page-content.schema';
import { Community } from '../schema/community.schema';

@Injectable()
export class CommunityHomeMigrationService {
  private readonly logger = new Logger(CommunityHomeMigrationService.name);

  constructor(
    @InjectModel(LandingPage.name)
    private readonly landingPageModel: Model<LandingPageDocument>,
    @InjectModel(CommunityPageContent.name)
    private readonly pageContentModel: Model<CommunityPageContentDocument>,
    @InjectModel(Community.name)
    private readonly communityModel: Model<any>,
  ) {}

  /**
   * Migrate all community page content records to landing-page-backed home pages
   * @param dryRun If true, only report what would be migrated, don't actually write.
   */
  async migrateAll(dryRun = false): Promise<{
    total: number;
    migrated: number;
    skipped: number;
    errors: string[];
    dryRun: boolean;
    details: Array<{ communityId: string; communityName: string; action: string }>;
  }> {
    const results = {
      total: 0,
      migrated: 0,
      skipped: 0,
      errors: [] as string[],
      dryRun,
      details: [] as Array<{ communityId: string; communityName: string; action: string }>,
    };

    const allContent = await this.pageContentModel.find({}).lean();
    results.total = allContent.length;

    this.logger.log(
      `${dryRun ? '[DRY RUN] ' : ''}Found ${allContent.length} community page content records to migrate`,
    );

    for (const content of allContent) {
      try {
        const communityId = (content as any).community?.toString();
        const community = await this.communityModel.findById(communityId).lean();
        const communityName = (community as any)?.name || communityId;

        // Check if already migrated
        const existing = await this.landingPageModel.findOne({
          communityId: new Types.ObjectId(communityId),
          pageType: 'community-home',
          isPrimaryHome: true,
        });

        if (existing) {
          this.logger.log(`Community ${communityName} (${communityId}) already has a home page, skipping`);
          results.skipped++;
          results.details.push({ communityId, communityName, action: 'skipped - already migrated' });
          continue;
        }

        if (dryRun) {
          results.migrated++;
          results.details.push({ communityId, communityName, action: 'would migrate' });
          continue;
        }

        await this.migrateOne(content as any);
        results.migrated++;
        results.details.push({ communityId, communityName, action: 'migrated' });
      } catch (error) {
        const communityId = (content as any).community?.toString() || 'unknown';
        const errMsg = `Failed to migrate community ${communityId}: ${error.message}`;
        this.logger.error(errMsg);
        results.errors.push(errMsg);
        results.skipped++;
        results.details.push({ communityId, communityName: communityId, action: `error: ${error.message}` });
      }
    }

    this.logger.log(
      `${dryRun ? '[DRY RUN] ' : ''}Migration complete: ${results.migrated} migrated, ${results.skipped} skipped, ${results.errors.length} errors`,
    );

    return results;
  }

  /**
   * Migrate a single community's page content to a landing page
   */
  async migrateOne(content: any): Promise<void> {
    const communityId = content.community;

    // Check if already migrated
    const existing = await this.landingPageModel.findOne({
      communityId: new Types.ObjectId(communityId),
      pageType: 'community-home',
      isPrimaryHome: true,
    });

    if (existing) {
      this.logger.log(`Community ${communityId} already has a home page, skipping`);
      return;
    }

    // Get community info
    const community = await this.communityModel
      .findById(communityId)
      .lean();

    if (!community) {
      throw new Error(`Community ${communityId} not found`);
    }

    // Build blocks from old sections
    const blocks = this.mapContentToBlocks(content, community);

    // Determine status
    const status = content.isPublished ? 'published' : 'draft';

    // Create slug
    const baseSlug = `${(community as any).slug || (community as any).name || 'community'}-home`;
    const slug = baseSlug
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 80);

    // Create landing page
    const landingPage = new this.landingPageModel({
      creator: (community as any).createur,
      communityId: new Types.ObjectId(communityId),
      pageType: 'community-home',
      isPrimaryHome: true,
      title: `${(community as any).name} - Home Page`,
      slug,
      description: (community as any).short_description || '',
      status,
      publishedAt: content.isPublished ? new Date() : undefined,
      blocks,
      seo: {
        title: (community as any).name,
        description: (community as any).short_description || '',
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

    const saved = await landingPage.save();

    // Update community with homePageId
    await this.communityModel.findByIdAndUpdate(communityId, {
      $set: { homePageId: saved._id },
    });

    this.logger.log(
      `Migrated community ${(community as any).name} (${communityId}) → landing page ${saved._id}`,
    );
  }

  /**
   * Map old community page content sections to landing page blocks
   */
  private mapContentToBlocks(content: any, community: any): Record<string, any>[] {
    const blocks: Record<string, any>[] = [];
    const now = Date.now();

    // Hero block
    const hero = content.hero || {};
    blocks.push({
      id: `migrated-${now}-hero`,
      type: 'hero',
      content: {
        headline: hero.customTitle || community.name || 'Welcome',
        subheadline: hero.customSubtitle || community.short_description || '',
        ctaText: hero.ctaButtonText || 'Join Community',
        ctaUrl: '#join',
        backgroundImage: hero.customBanner || community.photo_de_couverture || '',
      },
      style: {
        backgroundColor: '#0f0a2e',
        textColor: '#ffffff',
        padding: { top: 80, right: 20, bottom: 80, left: 20 },
      },
      visible: true,
    });

    // Community Join block (always inject)
    blocks.push({
      id: `migrated-${now}-join`,
      type: 'community-join',
      content: {
        headline: 'Join Our Community',
        subheadline: 'Get access to exclusive content, resources, and a supportive network.',
        communityId: community._id?.toString(),
        communitySlug: community.slug,
        communityName: community.name,
        showPricing: true,
        showMemberCount: hero.showMemberCount ?? true,
        showRating: hero.showRating ?? true,
        ctaText: hero.ctaButtonText || 'Join Now',
        ctaUrl: '#join',
      },
      style: {
        backgroundColor: '#f8f7ff',
        textColor: '#1a1a2e',
        padding: { top: 60, right: 20, bottom: 60, left: 20 },
      },
      visible: true,
    });

    // Overview → Features block
    const overview = content.overview || {};
    if (overview.visible !== false && overview.cards?.length > 0) {
      blocks.push({
        id: `migrated-${now}-features`,
        type: 'features',
        content: {
          headline: overview.title || 'Community Overview',
          subheadline: overview.subtitle || '',
          features: overview.cards
            .filter((c: any) => c.visible !== false)
            .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
            .map((card: any) => ({
              title: card.title || '',
              description: card.description || '',
              icon: card.icon || '✨',
            })),
        },
        style: {
          backgroundColor: '#ffffff',
          textColor: '#1a1a2e',
          padding: { top: 60, right: 20, bottom: 60, left: 20 },
        },
        visible: true,
      });
    }

    // Benefits → second Features block or text block
    const benefits = content.benefits || {};
    if (benefits.visible !== false && benefits.benefits?.length > 0) {
      const titleSuffix = benefits.titleSuffix || community.name || '';
      blocks.push({
        id: `migrated-${now}-benefits`,
        type: 'features',
        content: {
          headline: `${benefits.titlePrefix || 'Transform Your Skills with'} ${titleSuffix}`.trim(),
          subheadline: benefits.subtitle || '',
          features: benefits.benefits
            .filter((b: any) => b.visible !== false)
            .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
            .map((item: any) => ({
              title: item.title || '',
              description: item.description || '',
              icon: item.icon || '🚀',
            })),
        },
        style: {
          backgroundColor: '#f8f7ff',
          textColor: '#1a1a2e',
          padding: { top: 60, right: 20, bottom: 60, left: 20 },
        },
        visible: true,
      });
    }

    // Testimonials block
    const testimonials = content.testimonials || {};
    if (testimonials.visible !== false && testimonials.testimonials?.length > 0) {
      blocks.push({
        id: `migrated-${now}-testimonials`,
        type: 'testimonials',
        content: {
          headline: testimonials.title || 'What Members Are Saying',
          subheadline: testimonials.subtitle || '',
          testimonials: testimonials.testimonials
            .filter((t: any) => t.visible !== false)
            .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
            .map((t: any) => ({
              name: t.name || 'Member',
              role: t.role || '',
              content: t.content || '',
              avatar: t.avatar || '',
              rating: t.rating || 5,
            })),
        },
        style: {
          backgroundColor: '#ffffff',
          textColor: '#1a1a2e',
          padding: { top: 60, right: 20, bottom: 60, left: 20 },
        },
        visible: true,
      });
    }

    // CTA block
    const cta = content.cta || {};
    if (cta.visible !== false) {
      blocks.push({
        id: `migrated-${now}-cta`,
        type: 'cta',
        content: {
          headline: cta.title || 'Ready to Get Started?',
          subheadline: cta.subtitle || `Join ${community.name} today.`,
          ctaText: cta.buttonText || 'Join Community Now',
          ctaUrl: '#join',
          backgroundImage: cta.customBackground || '',
        },
        style: {
          backgroundColor: '#0f0a2e',
          textColor: '#ffffff',
          padding: { top: 60, right: 20, bottom: 60, left: 20 },
        },
        visible: true,
      });
    }

    return blocks;
  }

  /**
   * Check migration status for all communities
   */
  async getMigrationStatus(): Promise<{
    totalCommunities: number;
    withOldContent: number;
    withNewHomePage: number;
    needsMigration: number;
  }> {
    const [totalCommunities, withOldContent, withNewHomePage] = await Promise.all([
      this.communityModel.countDocuments({}),
      this.pageContentModel.countDocuments({}),
      this.landingPageModel.countDocuments({
        pageType: 'community-home',
        isPrimaryHome: true,
      }),
    ]);

    return {
      totalCommunities,
      withOldContent,
      withNewHomePage,
      needsMigration: withOldContent - withNewHomePage,
    };
  }
}
