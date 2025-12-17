import { 
  Injectable, 
  NotFoundException, 
  ForbiddenException,
  BadRequestException 
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { 
  CommunityPageContent, 
  CommunityPageContentDocument,
  HeroSection,
  OverviewSection,
  BenefitsSection,
  TestimonialsSection,
  CTASection,
  OverviewCard,
  BenefitItem,
  Testimonial
} from '../schema/community-page-content.schema';
import { Community, CommunityDocument } from '../schema/community.schema';
import { 
  UpdateCommunityPageContentDto,
  PublishContentDto,
  AddTestimonialDto,
  HeroSectionDto,
  OverviewSectionDto,
  BenefitsSectionDto,
  TestimonialsSectionDto,
  CTASectionDto,
  OverviewCardDto,
  BenefitItemDto,
  TestimonialDto
} from '../dto-community/community-page-content.dto';
import { UploadService } from '../upload/upload.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class CommunityPageContentService {
  constructor(
    @InjectModel(CommunityPageContent.name) 
    private pageContentModel: Model<CommunityPageContentDocument>,
    @InjectModel(Community.name) 
    private communityModel: Model<CommunityDocument>,
    private uploadService: UploadService,
  ) {}

  /**
   * Get page content for a community (public - only returns published content)
   * @param slug Community slug
   * @returns Published page content or default content
   */
  async getPublishedContent(slug: string) {
    // Find community by slug
    const community = await this.communityModel.findOne({ slug, isActive: true });
    
    if (!community) {
      throw new NotFoundException('Community not found');
    }

    // Try to find published content
    const content = await this.pageContentModel
      .findOne({ 
        community: community._id, 
        isPublished: true 
      })
      .exec();

    // If no published content, return default content
    if (!content) {
      return this.getDefaultContent(community);
    }

    return this.formatResponse(content, community);
  }

  /**
   * Get page content for editing (creator only - includes draft content)
   * @param communityId Community ID
   * @param userId User ID (must be community creator)
   * @returns Page content for editing
   */
  async getContentForEditing(communityId: string, userId: string) {
    const community = await this.communityModel.findById(communityId);
    
    if (!community) {
      throw new NotFoundException('Community not found');
    }

    // Check if user is the creator
    if (community.createur.toString() !== userId) {
      throw new ForbiddenException('Only the community creator can edit page content');
    }

    const editorObjectId = new Types.ObjectId(userId);
    const content = await this.getOrCreateContentDocument(community._id, editorObjectId);
    return this.formatResponse(content, community);
  }

  /**
   * Update page content sections
   * @param communityId Community ID
   * @param userId User ID (must be community creator)
   * @param updateDto Update data
   * @returns Updated content
   */
  async updateContent(
    communityId: string, 
    userId: string, 
    updateDto: UpdateCommunityPageContentDto
  ) {
    const community = await this.communityModel.findById(communityId);
    
    if (!community) {
      throw new NotFoundException('Community not found');
    }

    // Check if user is the creator
    if (community.createur.toString() !== userId) {
      throw new ForbiddenException('Only the community creator can edit page content');
    }

    const editorObjectId = new Types.ObjectId(userId);
    const content = await this.getOrCreateContentDocument(community._id, editorObjectId);

    if (updateDto.hero) {
      content.hero = this.applyHeroUpdate(content.hero, updateDto.hero);
    }
    if (updateDto.overview) {
      content.overview = this.applyOverviewUpdate(content.overview, updateDto.overview);
    }
    if (updateDto.benefits) {
      content.benefits = this.applyBenefitsUpdate(content.benefits, updateDto.benefits);
    }
    if (updateDto.testimonials) {
      content.testimonials = this.applyTestimonialsUpdate(
        content.testimonials,
        updateDto.testimonials,
      );
    }
    if (updateDto.cta) {
      content.cta = this.applyCtaUpdate(content.cta, updateDto.cta);
    }

    content.lastEditedBy = editorObjectId;
    await content.save();

    return this.formatResponse(content, community);
  }

  /**
   * Publish or unpublish content
   * @param communityId Community ID
   * @param userId User ID (must be community creator)
   * @param publishDto Publish state
   * @returns Updated content
   */
  async publishContent(
    communityId: string,
    userId: string,
    publishDto: PublishContentDto
  ) {
    const community = await this.communityModel.findById(communityId);
    
    if (!community) {
      throw new NotFoundException('Community not found');
    }

    // Check if user is the creator
    if (community.createur.toString() !== userId) {
      throw new ForbiddenException('Only the community creator can publish content');
    }

    const content = await this.findContentDocument(community._id);
    if (!content) {
      throw new NotFoundException('No content to publish. Please create content first.');
    }

    content.isPublished = publishDto.isPublished;
    content.lastEditedBy = new Types.ObjectId(userId);
    await content.save();

    return {
      success: true,
      message: publishDto.isPublished ? 'Content published successfully' : 'Content unpublished',
      data: this.formatResponse(content, community)
    };
  }

  /**
   * Add a testimonial with avatar upload
   * @param communityId Community ID
   * @param userId User ID (must be community creator)
   * @param testimonialDto Testimonial data
   * @returns Updated testimonials section
   */
  async addTestimonial(
    communityId: string,
    userId: string,
    testimonialDto: AddTestimonialDto
  ) {
    const community = await this.communityModel.findById(communityId);
    
    if (!community) {
      throw new NotFoundException('Community not found');
    }

    // Check if user is the creator
    if (community.createur.toString() !== userId) {
      throw new ForbiddenException('Only the community creator can add testimonials');
    }

    const editorObjectId = new Types.ObjectId(userId);

    const avatarUpload = await this.uploadService.uploadBase64Image(
      testimonialDto.base64Avatar,
      {
        userId,
        folder: 'testimonials',
      },
    );

    const content = await this.getOrCreateContentDocument(community._id, editorObjectId);

    // Add testimonial
    const newTestimonial = {
      id: uuidv4(),
      name: testimonialDto.name,
      role: testimonialDto.role,
      avatar: avatarUpload.url,
      rating: testimonialDto.rating,
      content: testimonialDto.content,
      order:
        typeof testimonialDto.order === 'number'
          ? testimonialDto.order
          : content.testimonials.testimonials.length,
      visible: true,
      createdAt: new Date()
    };

    content.testimonials.testimonials.push(newTestimonial);
    content.lastEditedBy = editorObjectId;
    await content.save();

    return {
      success: true,
      message: 'Testimonial added successfully',
      data: {
        testimonial: newTestimonial,
        testimonials: content.testimonials
      }
    };
  }

  /**
   * Delete a testimonial
   * @param communityId Community ID
   * @param userId User ID (must be community creator)
   * @param testimonialId Testimonial ID
   * @returns Updated testimonials section
   */
  async deleteTestimonial(
    communityId: string,
    userId: string,
    testimonialId: string
  ) {
    const community = await this.communityModel.findById(communityId);
    
    if (!community) {
      throw new NotFoundException('Community not found');
    }

    // Check if user is the creator
    if (community.createur.toString() !== userId) {
      throw new ForbiddenException('Only the community creator can delete testimonials');
    }

    const content = await this.findContentDocument(community._id);
    if (!content) {
      throw new NotFoundException('No content found');
    }

    // Remove testimonial
    const initialLength = content.testimonials.testimonials.length;
    content.testimonials.testimonials = content.testimonials.testimonials.filter(
      t => t.id !== testimonialId
    );

    if (content.testimonials.testimonials.length === initialLength) {
      throw new NotFoundException('Testimonial not found');
    }

    content.lastEditedBy = new Types.ObjectId(userId);
    await content.save();

    return {
      success: true,
      message: 'Testimonial deleted successfully',
      data: {
        testimonials: content.testimonials
      }
    };
  }

  private async findContentDocument(
    communityId: Types.ObjectId,
  ): Promise<CommunityPageContentDocument | null> {
    const content = await this.pageContentModel
      .findOne({ community: communityId })
      .exec();
    return (content as CommunityPageContentDocument | null) ?? null;
  }

  private async getOrCreateContentDocument(
    communityId: Types.ObjectId,
    userId: Types.ObjectId,
  ): Promise<CommunityPageContentDocument> {
    const existing = await this.findContentDocument(communityId);
    if (existing) {
      return existing;
    }
    return this.initializeContent(communityId, userId);
  }

  private applyHeroUpdate(current: HeroSection, dto: HeroSectionDto): HeroSection {
    return {
      ...current,
      ...dto,
    };
  }

  private applyOverviewUpdate(
    current: OverviewSection,
    dto: OverviewSectionDto,
  ): OverviewSection {
    const { cards, ...rest } = dto;
    const updated: OverviewSection = {
      ...current,
      ...rest,
    };
    if (cards) {
      updated.cards = this.mapOverviewCards(cards, current.cards);
    }
    return updated;
  }

  private applyBenefitsUpdate(
    current: BenefitsSection,
    dto: BenefitsSectionDto,
  ): BenefitsSection {
    const { benefits, ...rest } = dto;
    const updated: BenefitsSection = {
      ...current,
      ...rest,
    };
    if (benefits) {
      updated.benefits = this.mapBenefitItems(benefits, current.benefits);
    }
    return updated;
  }

  private applyTestimonialsUpdate(
    current: TestimonialsSection,
    dto: TestimonialsSectionDto,
  ): TestimonialsSection {
    const { testimonials, ...rest } = dto;
    const updated: TestimonialsSection = {
      ...current,
      ...rest,
    };
    if (testimonials) {
      updated.testimonials = this.mapTestimonialDtos(testimonials, current.testimonials);
    }
    return updated;
  }

  private applyCtaUpdate(current: CTASection, dto: CTASectionDto): CTASection {
    return {
      ...current,
      ...dto,
    };
  }

  private mapOverviewCards(cards: OverviewCardDto[], existing: OverviewCard[]): OverviewCard[] {
    const existingMap = new Map(existing.map((card) => [card.id, card]));
    return cards.map((card, index) => {
      const fallback = existingMap.get(card.id);
      return {
        id: card.id,
        title: card.title,
        description: card.description,
        icon: card.icon,
        iconColor: card.iconColor,
        order: card.order ?? fallback?.order ?? index,
        visible: card.visible ?? fallback?.visible ?? true,
      };
    });
  }

  private mapBenefitItems(items: BenefitItemDto[], existing: BenefitItem[]): BenefitItem[] {
    const existingMap = new Map(existing.map((item) => [item.id, item]));
    return items.map((item, index) => {
      const fallback = existingMap.get(item.id);
      return {
        id: item.id,
        title: item.title,
        description: item.description,
        icon: item.icon,
        iconColor: item.iconColor,
        order: item.order ?? fallback?.order ?? index,
        visible: item.visible ?? fallback?.visible ?? true,
      };
    });
  }

  private mapTestimonialDtos(items: TestimonialDto[], existing: Testimonial[]): Testimonial[] {
    const existingMap = new Map(existing.map((testimonial) => [testimonial.id, testimonial]));
    return items.map((item, index) => {
      const fallback = existingMap.get(item.id);
      return {
        id: item.id,
        name: item.name,
        role: item.role,
        avatar: item.avatar,
        rating: item.rating,
        content: item.content,
        order: item.order ?? fallback?.order ?? index,
        visible: item.visible ?? fallback?.visible ?? true,
        createdAt: fallback?.createdAt ?? new Date(),
      };
    });
  }

  /**
   * Initialize default content for a community
   * @param communityId Community ID
   * @param userId User ID
   * @returns Created content
   */
  private async initializeContent(
    communityId: Types.ObjectId,
    userId: Types.ObjectId
  ): Promise<CommunityPageContentDocument> {
    const newContent = new this.pageContentModel({
      community: communityId,
      lastEditedBy: userId,
      isPublished: false
    });

    return await newContent.save();
  }

  /**
   * Get default content structure for communities without custom content
   * @param community Community document
   * @returns Default content structure
   */
  private getDefaultContent(community: CommunityDocument) {
    return {
      communityId: community._id.toString(),
      communitySlug: community.slug,
      communityName: community.name,
      hero: {
        customTitle: '',
        customSubtitle: '',
        customBanner: '',
        ctaButtonText: 'Join Community',
        showMemberCount: true,
        showRating: true,
        showCreator: true
      },
      overview: {
        title: 'Community Overview',
        subtitle: 'Everything you need to succeed is included in this community.',
        visible: true,
        cards: [
          {
            id: '1',
            title: 'Access to exclusive community discussions and forums',
            description: 'Connect with like-minded individuals',
            icon: '💬',
            iconColor: '#3B82F6',
            order: 0,
            visible: true
          },
          {
            id: '2',
            title: 'Weekly live Q&A sessions with industry experts',
            description: 'Get your questions answered directly',
            icon: '🎥',
            iconColor: '#8B5CF6',
            order: 1,
            visible: true
          },
          {
            id: '3',
            title: 'Premium resources, templates, and learning materials',
            description: 'Everything you need to succeed',
            icon: '📚',
            iconColor: '#10B981',
            order: 2,
            visible: true
          },
          {
            id: '4',
            title: 'Networking opportunities with like-minded professionals',
            description: 'Build meaningful connections',
            icon: '🤝',
            iconColor: '#F59E0B',
            order: 3,
            visible: true
          }
        ]
      },
      benefits: {
        titlePrefix: 'Transform Your Skills with',
        titleSuffix: '',
        subtitle: '',
        visible: true,
        ctaTitle: 'Ready to get started?',
        ctaSubtitle: 'Join this community today',
        benefits: [
          {
            id: '1',
            title: 'Expert-Led Content',
            description: 'Learn from industry professionals who coach teams, develop courses, and share real-world insights.',
            icon: '🎓',
            iconColor: '#8B5CF6',
            order: 0,
            visible: true
          },
          {
            id: '2',
            title: 'Proven Results',
            description: 'Join members who have significantly improved their skills through our structured learning approach.',
            icon: '📈',
            iconColor: '#8B5CF6',
            order: 1,
            visible: true
          },
          {
            id: '3',
            title: 'Lifetime Access',
            description: 'Get unlimited access to all current and future courses, resources, and community features.',
            icon: '♾️',
            iconColor: '#8B5CF6',
            order: 2,
            visible: true
          },
          {
            id: '4',
            title: 'Continuous Growth',
            description: 'Regular updates with new content and resources tailored to help you stay ahead in your field.',
            icon: '🚀',
            iconColor: '#8B5CF6',
            order: 3,
            visible: true
          }
        ]
      },
      testimonials: {
        title: 'What Members Are Saying',
        subtitle: 'Join thousands of satisfied members who have achieved amazing results.',
        visible: true,
        showRatings: true,
        testimonials: []
      },
      cta: {
        title: 'Ready to Get Started?',
        subtitle: `Take the first step in your journey to success with the ${community.name} community.`,
        buttonText: 'Join Community Now',
        visible: true,
        customBackground: ''
      },
      isPublished: false,
      version: 0
    };
  }

  /**
   * Format response for API
   * @param content Content document
   * @param community Community document
   * @returns Formatted response
   */
  private formatResponse(
    content: CommunityPageContentDocument,
    community: CommunityDocument
  ) {
    return {
      id: content._id.toString(),
      communityId: community._id.toString(),
      communitySlug: community.slug,
      communityName: community.name,
      hero: content.hero,
      overview: content.overview,
      benefits: content.benefits,
      testimonials: content.testimonials,
      cta: content.cta,
      isPublished: content.isPublished,
      version: content.version,
      createdAt: content.createdAt,
      updatedAt: content.updatedAt
    };
  }
}
