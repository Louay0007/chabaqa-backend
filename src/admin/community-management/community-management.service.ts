import { Injectable, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Community, CommunityDocument } from '../../schema/community.schema';
import { User, UserDocument } from '../../schema/user.schema';
import { Post, PostDocument } from '../../schema/post.schema';
import { Cours, CoursDocument } from '../../schema/course.schema';
import { Event, EventDocument } from '../../schema/event.schema';
import { Product, ProductDocument } from '../../schema/product.schema';
import { AuditLogService } from '../common/services/audit-log.service';
import { CacheService } from '../../common/services/cache.service';
import { AdminAction } from '../schemas/audit-log.schema';
import { 
  CommunityFiltersDto, 
  CommunityApprovalFiltersDto,
  CommunityStatus,
  CommunityType,
  CommunityPriceType 
} from './dto/community-filters.dto';
import { 
  ApproveCommunityDto, 
  RejectCommunityDto, 
  BulkCommunityApprovalDto,
  CommunityModerationDto,
  ApprovalAction 
} from './dto/community-approval.dto';
import { 
  CommunityResponseDto, 
  CommunityApprovalRequestDto,
  CommunityAnalyticsDto 
} from './dto/community-response.dto';
import {
  CommunityAnalyticsFiltersDto,
  DetailedCommunityAnalyticsDto,
  CommunityAnalyticsSummaryDto,
  CommunityComparisonDto,
  CommunityGrowthMetricsDto,
  CommunityEngagementMetricsDto,
  CommunityRevenueMetricsDto,
  CommunityContentMetricsDto,
  CommunityRetentionMetricsDto,
  CommunityPerformanceMetricsDto
} from './dto/community-analytics.dto';
import { PaginatedResult, TimePeriod } from '../common/interfaces/admin-interfaces';

@Injectable()
export class CommunityManagementService {
  constructor(
    @InjectModel(Community.name) private communityModel: Model<CommunityDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Post.name) private postModel: Model<PostDocument>,
    @InjectModel(Cours.name) private courseModel: Model<CoursDocument>,
    @InjectModel(Event.name) private eventModel: Model<EventDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    private readonly auditLogService: AuditLogService,
    private readonly cacheService: CacheService,
  ) {}

  private async invalidateExploreAndCommunityCaches(community?: Partial<Community> & { _id?: any; slug?: string }): Promise<void> {
    const communityId = String((community as any)?._id || '').trim();
    const communitySlug = String((community as any)?.slug || '').trim();

    const patterns = [
      'http:/community-aff-crea-join*',
      'http:/communities*',
      'http:/cours*',
      'http:/challenges*',
      'http:/products*',
      'http:/sessions*',
      'http:/events*',
    ];

    if (communityId) {
      patterns.push(`http:/community-aff-crea-join/${communityId}*`);
      patterns.push(`http:/community-aff-crea-join/community/${communityId}*`);
      patterns.push(`http:/communities/${communityId}*`);
    }

    if (communitySlug) {
      patterns.push(`http:/community-aff-crea-join/${communitySlug}*`);
      patterns.push(`http:/communities/${communitySlug}*`);
    }

    try {
      await Promise.allSettled(
        Array.from(new Set(patterns)).map((pattern) => this.cacheService.deletePattern(pattern)),
      );
    } catch (error) {
      console.warn('Failed to invalidate community/explore caches:', error);
    }
  }

  /**
   * Get communities with advanced filtering and pagination
   * Requirement 2.1: Community listing with metrics and status information
   */
  async getCommunities(
    filters: CommunityFiltersDto,
    adminUserId: string,
    ipAddress: string,
    userAgent: string
  ): Promise<PaginatedResult<CommunityResponseDto>> {
    try {
      // Build query based on filters
      const query: any = {};

      // Search term filter
      if (filters.searchTerm) {
        query.$or = [
          { name: { $regex: filters.searchTerm, $options: 'i' } },
          { short_description: { $regex: filters.searchTerm, $options: 'i' } },
          { category: { $regex: filters.searchTerm, $options: 'i' } }
        ];
      }

      // Status filter
      if (filters.status && filters.status.length > 0) {
        const statusConditions: any[] = [];
        
        filters.status.forEach(status => {
          switch (status) {
            case CommunityStatus.ACTIVE:
              statusConditions.push({ isActive: true });
              break;
            case CommunityStatus.INACTIVE:
              statusConditions.push({ isActive: false });
              break;
            case CommunityStatus.SUSPENDED:
              statusConditions.push({ isSuspended: true });
              break;
            case CommunityStatus.PENDING_APPROVAL:
              statusConditions.push({ approvalStatus: 'pending' });
              break;
            case CommunityStatus.REJECTED:
              statusConditions.push({ approvalStatus: 'rejected' });
              break;
          }
        });

        if (statusConditions.length > 0) {
          query.$or = query.$or ? [...query.$or, ...statusConditions] : statusConditions;
        }
      }

      // Type filter (public/private)
      if (filters.type && filters.type.length > 0) {
        const typeConditions: any[] = [];
        
        filters.type.forEach(type => {
          switch (type) {
            case CommunityType.PUBLIC:
              typeConditions.push({ isPrivate: false });
              break;
            case CommunityType.PRIVATE:
              typeConditions.push({ isPrivate: true });
              break;
          }
        });

        if (typeConditions.length > 0) {
          if (query.$or) {
            query.$and = [{ $or: query.$or }, { $or: typeConditions }];
            delete query.$or;
          } else {
            query.$or = typeConditions;
          }
        }
      }

      // Price type filter
      if (filters.priceType && filters.priceType.length > 0) {
        query.priceType = { $in: filters.priceType };
      }

      // Category filter
      if (filters.category) {
        query.category = { $regex: filters.category, $options: 'i' };
      }

      // Creator filter
      if (filters.creatorId) {
        query.createur = new Types.ObjectId(filters.creatorId);
      }

      // Member count filters
      if (filters.minMembers !== undefined || filters.maxMembers !== undefined) {
        query.membersCount = {};
        if (filters.minMembers !== undefined) {
          query.membersCount.$gte = filters.minMembers;
        }
        if (filters.maxMembers !== undefined) {
          query.membersCount.$lte = filters.maxMembers;
        }
      }

      // Date range filters
      if (filters.createdAfter || filters.createdBefore) {
        query.createdAt = {};
        if (filters.createdAfter) {
          query.createdAt.$gte = new Date(filters.createdAfter);
        }
        if (filters.createdBefore) {
          query.createdAt.$lte = new Date(filters.createdBefore);
        }
      }

      // Featured filter
      if (filters.featured !== undefined) {
        query.featured = filters.featured;
      }

      // Verified filter
      if (filters.verified !== undefined) {
        query.isVerified = filters.verified;
      }

      // Pagination
      const page = filters.page || 1;
      const limit = filters.limit || 20;
      const skip = (page - 1) * limit;

      // Sorting
      const sortField = filters.sortBy || 'createdAt';
      const sortOrder = filters.sortOrder === 'asc' ? 1 : -1;
      const sort: any = {};
      sort[sortField] = sortOrder;

      // Execute query with population
      const [communities, total] = await Promise.all([
        this.communityModel
          .find(query)
          .populate('createur', 'name email profile_picture photo_profil avatar verified')
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .exec(),
        this.communityModel.countDocuments(query)
      ]);

      // Calculate content counts
      const communityIds = communities.map(c => c._id.toString());
      const communityObjectIds = communities.map(c => c._id);

      const [postCounts, eventCounts, productCounts] = await Promise.all([
        this.postModel.aggregate([
          { $match: { communityId: { $in: communityIds } } },
          { $group: { _id: '$communityId', count: { $sum: 1 } } }
        ]),
        this.eventModel.aggregate([
          { $match: { communityId: { $in: communityObjectIds } } },
          { $group: { _id: '$communityId', count: { $sum: 1 } } }
        ]),
        this.productModel.aggregate([
          { $match: { communityId: { $in: communityIds } } },
          { $group: { _id: '$communityId', count: { $sum: 1 } } }
        ])
      ]);

      const contentCountsMap = new Map<string, number>();
      
      // Initialize with 0
      communityIds.forEach(id => contentCountsMap.set(id, 0));

      // Add posts
      postCounts.forEach((item: any) => {
        const current = contentCountsMap.get(item._id) || 0;
        contentCountsMap.set(item._id, current + item.count);
      });

      // Add events
      eventCounts.forEach((item: any) => {
        const id = item._id.toString();
        const current = contentCountsMap.get(id) || 0;
        contentCountsMap.set(id, current + item.count);
      });

      // Add products
      productCounts.forEach((item: any) => {
        const current = contentCountsMap.get(item._id) || 0;
        contentCountsMap.set(item._id, current + item.count);
      });

      // Transform communities to response DTOs
      const transformedCommunities = communities.map(community => {
        const courseCount = community.cours ? community.cours.length : 0;
        const otherContentCount = contentCountsMap.get(community._id.toString()) || 0;
        return this.transformCommunityToDto(community, courseCount + otherContentCount);
      });

      // Log admin action
      await this.auditLogService.logAction({
        adminUserId: new Types.ObjectId(adminUserId),
        action: AdminAction.COMMUNITY_VIEW,
        entityType: 'Community',
        entityId: new Types.ObjectId(), // No specific entity for list view
        ipAddress,
        userAgent,
        metadata: {
          filters,
          resultCount: communities.length,
          totalCount: total
        }
      });

      return {
        data: transformedCommunities,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      };
    } catch (error) {
      console.error('Error fetching communities:', error);
      throw new InternalServerErrorException('Failed to fetch communities');
    }
  }

  async getCommunityDetails(
    communityId: string,
    adminUserId: string,
    ipAddress: string,
    userAgent: string
  ): Promise<CommunityResponseDto> {
    try {
      const community = await this.communityModel
        .findById(communityId)
        .populate('createur', 'name email profile_picture photo_profil avatar verified')
        .populate('members', 'name username email profile_picture photo_profil avatar createdAt')
        .exec();

      if (!community) {
        throw new NotFoundException('Community not found');
      }

      const communityIdStr = community._id.toString();
      const communityObjectId = community._id;

      // Get content counts and recent items
      const [
        postCount,
        eventCount,
        productCount,
        posts,
        events,
        products,
        courses
      ] = await Promise.all([
        this.postModel.countDocuments({ communityId: communityIdStr }),
        this.eventModel.countDocuments({ communityId: communityObjectId }),
        this.productModel.countDocuments({ communityId: communityIdStr }),
        this.postModel.find({ communityId: communityIdStr }).sort({ createdAt: -1 }).limit(10).exec(),
        this.eventModel.find({ communityId: communityObjectId }).sort({ createdAt: -1 }).limit(10).exec(),
        this.productModel.find({ communityId: communityIdStr }).sort({ createdAt: -1 }).limit(10).exec(),
        this.courseModel.find({ communityId: communityIdStr }).sort({ createdAt: -1 }).limit(10).exec()
      ]);

      const courseCount = community.cours ? community.cours.length : 0;
      const totalContentCount = postCount + eventCount + productCount + courseCount;

      // Format content list
      const contentList = [
        ...posts.map(p => ({ 
          _id: p._id,
          title: p.content?.substring(0, 50) + (p.content?.length > 50 ? '...' : '') || 'Untitled Post', 
          type: 'post', 
          createdAt: p.createdAt 
        })),
        ...events.map(e => ({ 
          _id: e._id,
          title: e.title, 
          type: 'event', 
          createdAt: e.startDate 
        })),
        ...products.map(p => ({ 
          _id: p._id,
          title: p.title, 
          type: 'product', 
          createdAt: p.createdAt 
        })),
        ...courses.map(c => ({ 
          _id: c._id,
          title: c.titre, 
          type: 'course', 
          createdAt: c.createdAt 
        }))
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 20);

      const dto = this.transformCommunityToDto(community, totalContentCount);
      
      // Add extra details
      if (community.members && Array.isArray(community.members)) {
        dto.members = (community.members as any[]).map(m => ({
          _id: m._id,
          username: m.username || m.name,
          name: m.name,
          email: m.email,
          avatar: m.profile_picture || m.photo_profil || m.avatar,
          joinedAt: m.createdAt
        }));
      } else {
        dto.members = [];
      }
      
      dto.content = contentList;
      
      dto.analytics = {
        totalRevenue: community.stats?.totalRevenue || 0,
        activeMembers: community.membersCount || 0,
        contentPublished: totalContentCount,
        engagementRate: community.stats?.engagementRate || 0
      };

      // Log action
      await this.auditLogService.logAction({
        adminUserId: new Types.ObjectId(adminUserId),
        action: AdminAction.COMMUNITY_VIEW,
        entityType: 'Community',
        entityId: community._id,
        ipAddress,
        userAgent,
        metadata: { communityName: community.name }
      });

      return dto;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      console.error('Error fetching community details:', error);
      throw new InternalServerErrorException('Failed to fetch community details');
    }
  }

  /**
   * Get pending community approval requests
   * Requirement 2.2: Community approval workflow with queue management
   */
  async getPendingApprovals(
    filters: CommunityApprovalFiltersDto,
    adminUserId: string,
    ipAddress: string,
    userAgent: string
  ): Promise<PaginatedResult<CommunityApprovalRequestDto>> {
    try {
      // Build query for pending approvals
      const query: any = {
        $or: [
          { approvalStatus: 'pending' },
          { approvalStatus: { $exists: false } },
          { approvalStatus: null }
        ]
      };

      // Search term filter
      if (filters.searchTerm) {
        query.$and = query.$and || [];
        query.$and.push({
          $or: [
            { name: { $regex: filters.searchTerm, $options: 'i' } },
            { short_description: { $regex: filters.searchTerm, $options: 'i' } }
          ]
        });
      }

      // Category filter
      if (filters.category) {
        query.category = { $regex: filters.category, $options: 'i' };
      }

      // Date range filters
      if (filters.submittedAfter || filters.submittedBefore) {
        query.createdAt = {};
        if (filters.submittedAfter) {
          query.createdAt.$gte = new Date(filters.submittedAfter);
        }
        if (filters.submittedBefore) {
          query.createdAt.$lte = new Date(filters.submittedBefore);
        }
      }

      // Pagination
      const page = filters.page || 1;
      const limit = filters.limit || 20;
      const skip = (page - 1) * limit;

      // Sorting (by creation date for approval queue)
      const sortOrder = filters.sortOrder === 'asc' ? 1 : -1;
      const sort: any = { createdAt: sortOrder };

      // Execute query
      const [communities, total] = await Promise.all([
        this.communityModel
          .find(query)
          .populate('createur', 'name email profile_picture photo_profil avatar verified')
          .populate('approvedBy', 'name email')
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .exec(),
        this.communityModel.countDocuments(query)
      ]);

      // Transform to approval request DTOs
      const approvalRequests = communities.map(community => this.transformCommunityToApprovalDto(community));

      // Log admin action
      await this.auditLogService.logAction({
        adminUserId: new Types.ObjectId(adminUserId),
        action: AdminAction.COMMUNITY_VIEW,
        entityType: 'CommunityApproval',
        entityId: new Types.ObjectId(), // No specific entity for list view
        ipAddress,
        userAgent,
        metadata: {
          filters,
          resultCount: communities.length,
          totalCount: total,
          queueType: 'pending_approvals'
        }
      });

      return {
        data: approvalRequests,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      };

    } catch (error) {
      console.error('Error fetching pending approvals:', error);
      throw new InternalServerErrorException('Failed to fetch pending approvals');
    }
  }

  /**
   * Approve a community
   * Requirement 2.3: Community approval workflow
   */
  async approveCommunity(
    communityId: string,
    approvalData: ApproveCommunityDto,
    adminUserId: string,
    ipAddress: string,
    userAgent: string
  ): Promise<CommunityResponseDto> {
    try {
      const community = await this.communityModel.findById(communityId).populate('createur', 'name email');
      
      if (!community) {
        throw new NotFoundException('Community not found');
      }

      // Store previous data for audit
      const previousData = {
        approvalStatus: (community as any).approvalStatus,
        isActive: community.isActive,
        approvedBy: (community as any).approvedBy,
        approvedAt: (community as any).approvedAt
      };

      // Update community status
      (community as any).approvalStatus = 'approved';
      community.isActive = true;
      (community as any).approvedBy = new Types.ObjectId(adminUserId);
      (community as any).approvedAt = new Date();
      
      if (approvalData.notes) {
        (community as any).adminNotes = approvalData.notes;
      }

      await community.save();
      await this.invalidateExploreAndCommunityCaches(community as any);

      // Log admin action
      await this.auditLogService.logAction({
        adminUserId: new Types.ObjectId(adminUserId),
        action: AdminAction.COMMUNITY_APPROVE,
        entityType: 'Community',
        entityId: community._id,
        ipAddress,
        userAgent,
        previousData,
        newData: {
          approvalStatus: (community as any).approvalStatus,
          isActive: community.isActive,
          approvedBy: (community as any).approvedBy,
          approvedAt: (community as any).approvedAt,
          adminNotes: (community as any).adminNotes
        },
        metadata: {
          communityName: community.name,
          creatorId: community.createur.toString(),
          notes: approvalData.notes
        }
      });

      // Populate and return transformed community
      const populatedCommunity = await this.communityModel
        .findById(community._id)
        .populate('createur', 'name email profile_picture photo_profil avatar verified')
        .exec();

      return this.transformCommunityToDto(populatedCommunity!);

    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Error approving community:', error);
      throw new InternalServerErrorException('Failed to approve community');
    }
  }

  /**
   * Reject a community
   * Requirement 2.4: Community approval workflow
   */
  async rejectCommunity(
    communityId: string,
    rejectionData: RejectCommunityDto,
    adminUserId: string,
    ipAddress: string,
    userAgent: string
  ): Promise<CommunityResponseDto> {
    try {
      const community = await this.communityModel.findById(communityId).populate('createur', 'name email');
      
      if (!community) {
        throw new NotFoundException('Community not found');
      }

      // Store previous data for audit
      const previousData = {
        approvalStatus: (community as any).approvalStatus,
        isActive: community.isActive,
        rejectionReason: (community as any).rejectionReason
      };

      // Update community status
      (community as any).approvalStatus = 'rejected';
      community.isActive = false;
      (community as any).rejectionReason = rejectionData.reason;
      (community as any).approvedBy = new Types.ObjectId(adminUserId);
      (community as any).approvedAt = new Date();
      
      if (rejectionData.notes) {
        (community as any).adminNotes = rejectionData.notes;
      }

      await community.save();
      await this.invalidateExploreAndCommunityCaches(community as any);

      // Log admin action
      await this.auditLogService.logAction({
        adminUserId: new Types.ObjectId(adminUserId),
        action: AdminAction.COMMUNITY_REJECT,
        entityType: 'Community',
        entityId: community._id,
        ipAddress,
        userAgent,
        previousData,
        newData: {
          approvalStatus: (community as any).approvalStatus,
          isActive: community.isActive,
          rejectionReason: (community as any).rejectionReason,
          approvedBy: (community as any).approvedBy,
          approvedAt: (community as any).approvedAt,
          adminNotes: (community as any).adminNotes
        },
        metadata: {
          communityName: community.name,
          creatorId: community.createur.toString(),
          reason: rejectionData.reason,
          notes: rejectionData.notes
        }
      });

      // Populate and return transformed community
      const populatedCommunity = await this.communityModel
        .findById(community._id)
        .populate('createur', 'name email profile_picture photo_profil avatar verified')
        .exec();

      return this.transformCommunityToDto(populatedCommunity!);

    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Error rejecting community:', error);
      throw new InternalServerErrorException('Failed to reject community');
    }
  }

  /**
   * Bulk approve or reject communities
   * Requirement 2.2: Community approval workflow with queue management
   */
  async bulkApproveCommunities(
    bulkData: BulkCommunityApprovalDto,
    adminUserId: string,
    ipAddress: string,
    userAgent: string
  ): Promise<{ successCount: number; failureCount: number; failures: any[] }> {
    try {
      const results = {
        successCount: 0,
        failureCount: 0,
        failures: [] as any[]
      };

      // Validate required fields for rejection
      if (bulkData.action === ApprovalAction.REJECT && !bulkData.reason) {
        throw new BadRequestException('Reason is required for bulk rejection');
      }

      // Process each community
      for (const communityId of bulkData.communityIds) {
        try {
          if (bulkData.action === ApprovalAction.APPROVE) {
            await this.approveCommunity(
              communityId,
              { notes: bulkData.notes },
              adminUserId,
              ipAddress,
              userAgent
            );
          } else {
            await this.rejectCommunity(
              communityId,
              { reason: bulkData.reason!, notes: bulkData.notes },
              adminUserId,
              ipAddress,
              userAgent
            );
          }
          results.successCount++;
        } catch (error) {
          results.failureCount++;
          results.failures.push({
            communityId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Log bulk action
      await this.auditLogService.logAction({
        adminUserId: new Types.ObjectId(adminUserId),
        action: AdminAction.BULK_OPERATION,
        entityType: 'Community',
        entityId: new Types.ObjectId(), // No specific entity for bulk operation
        ipAddress,
        userAgent,
        metadata: {
          operation: `bulk_${bulkData.action}`,
          totalItems: bulkData.communityIds.length,
          successCount: results.successCount,
          failureCount: results.failureCount,
          reason: bulkData.reason,
          notes: bulkData.notes
        }
      });

      return results;

    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      console.error('Error in bulk community approval:', error);
      throw new InternalServerErrorException('Failed to process bulk community approval');
    }
  }

  /**
   * Moderate community settings
   * Requirement 2.5: Community moderation
   */
  async moderateCommunity(
    communityId: string,
    moderationData: CommunityModerationDto,
    adminUserId: string,
    ipAddress: string,
    userAgent: string
  ): Promise<CommunityResponseDto> {
    try {
      const community = await this.communityModel.findById(communityId);
      
      if (!community) {
        throw new NotFoundException('Community not found');
      }

      // Store previous data for audit
      const previousData = {
        featured: community.featured,
        isVerified: community.isVerified,
        isActive: community.isActive,
        adminNotes: (community as any).adminNotes
      };

      // Apply moderation changes
      if (moderationData.featured !== undefined) {
        community.featured = moderationData.featured;
      }
      
      if (moderationData.verified !== undefined) {
        community.isVerified = moderationData.verified;
      }
      
      if (moderationData.isActive !== undefined) {
        community.isActive = moderationData.isActive;
      }
      
      if (moderationData.adminNotes !== undefined) {
        (community as any).adminNotes = moderationData.adminNotes;
      }

      await community.save();
      await this.invalidateExploreAndCommunityCaches(community as any);

      // Log admin action
      await this.auditLogService.logAction({
        adminUserId: new Types.ObjectId(adminUserId),
        action: AdminAction.COMMUNITY_MODERATE,
        entityType: 'Community',
        entityId: community._id,
        ipAddress,
        userAgent,
        previousData,
        newData: {
          featured: community.featured,
          isVerified: community.isVerified,
          isActive: community.isActive,
          adminNotes: (community as any).adminNotes
        },
        metadata: {
          communityName: community.name,
          reason: moderationData.reason,
          changes: Object.keys(moderationData).filter(key => key !== 'reason')
        }
      });

      // Populate and return transformed community
      const populatedCommunity = await this.communityModel
        .findById(community._id)
        .populate('createur', 'name email profile_picture photo_profil avatar verified')
        .exec();

      return this.transformCommunityToDto(populatedCommunity!);

    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Error moderating community:', error);
      throw new InternalServerErrorException('Failed to moderate community');
    }
  }

  /**
   * Get community analytics
   * Requirement 2.6: Community analytics and reporting
   */
  async getCommunityAnalytics(
    communityId?: string,
    period: TimePeriod = TimePeriod.LAST_30_DAYS,
    adminUserId?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<CommunityAnalyticsDto | CommunityAnalyticsDto[]> {
    try {
      // Calculate date range based on period
      const endDate = new Date();
      const startDate = new Date();
      
      switch (period) {
        case TimePeriod.LAST_7_DAYS:
          startDate.setDate(endDate.getDate() - 7);
          break;
        case TimePeriod.LAST_30_DAYS:
          startDate.setDate(endDate.getDate() - 30);
          break;
        case TimePeriod.LAST_90_DAYS:
          startDate.setDate(endDate.getDate() - 90);
          break;
        case TimePeriod.LAST_YEAR:
          startDate.setFullYear(endDate.getFullYear() - 1);
          break;
        default:
          startDate.setDate(endDate.getDate() - 30);
      }

      if (communityId) {
        // Get analytics for specific community
        const community = await this.communityModel.findById(communityId);
        if (!community) {
          throw new NotFoundException('Community not found');
        }

        const analytics = await this.calculateCommunityAnalytics(community, startDate, endDate);
        
        // Log admin action if admin context provided
        if (adminUserId && ipAddress && userAgent) {
          await this.auditLogService.logAction({
            adminUserId: new Types.ObjectId(adminUserId),
            action: AdminAction.COMMUNITY_VIEW,
            entityType: 'CommunityAnalytics',
            entityId: community._id,
            ipAddress,
            userAgent,
            metadata: {
              period,
              startDate,
              endDate,
              communityName: community.name
            }
          });
        }

        return analytics;
      } else {
        // Get analytics for all communities
        const communities = await this.communityModel.find({ isActive: true }).limit(50); // Limit for performance
        
        const analyticsPromises = communities.map(community => 
          this.calculateCommunityAnalytics(community, startDate, endDate)
        );
        
        const analytics = await Promise.all(analyticsPromises);
        
        // Log admin action if admin context provided
        if (adminUserId && ipAddress && userAgent) {
          await this.auditLogService.logAction({
            adminUserId: new Types.ObjectId(adminUserId),
            action: AdminAction.COMMUNITY_VIEW,
            entityType: 'CommunityAnalytics',
            entityId: new Types.ObjectId(), // No specific entity for bulk analytics
            ipAddress,
            userAgent,
            metadata: {
              period,
              startDate,
              endDate,
              communitiesCount: communities.length
            }
          });
        }

        return analytics;
      }

    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Error fetching community analytics:', error);
      throw new InternalServerErrorException('Failed to fetch community analytics');
    }
  }

  /**
   * Calculate analytics for a specific community
   * Private helper method for analytics calculation
   */
  private async calculateCommunityAnalytics(
    community: CommunityDocument,
    startDate: Date,
    endDate: Date
  ): Promise<CommunityAnalyticsDto> {
    // Mock analytics calculation - in real implementation, this would query actual data
    // from posts, user activity, revenue records, etc.
    
    const membersCount = community.membersCount || 0;
    
    // Mock member growth calculations
    const memberGrowth = {
      daily: Math.floor(membersCount * 0.01 + Math.random() * 5),
      weekly: Math.floor(membersCount * 0.05 + Math.random() * 20),
      monthly: Math.floor(membersCount * 0.15 + Math.random() * 50)
    };

    // Mock engagement metrics
    const activeMembers = Math.floor(membersCount * (0.2 + Math.random() * 0.3));
    const engagementRate = Math.round((activeMembers / Math.max(membersCount, 1)) * 100);
    const averageSessionDuration = Math.floor(300 + Math.random() * 1200); // 5-25 minutes

    // Mock revenue metrics
    const baseRevenue = community.fees_of_join || 0;
    const totalRevenue = Math.floor(baseRevenue * membersCount * (0.8 + Math.random() * 0.4));
    const monthlyRecurringRevenue = community.priceType === 'monthly' ? 
      Math.floor(totalRevenue * 0.7) : 0;
    const averageRevenuePerUser = membersCount > 0 ? 
      Math.floor(totalRevenue / membersCount) : 0;

    // Mock content metrics
    const contentMetrics = {
      totalPosts: Math.floor(membersCount * (0.5 + Math.random() * 2)),
      totalCourses: Math.floor(Math.random() * 10),
      totalEvents: Math.floor(Math.random() * 5)
    };

    // Mock retention metrics
    const retentionMetrics = {
      day1Retention: Math.round(70 + Math.random() * 25), // 70-95%
      day7Retention: Math.round(40 + Math.random() * 30), // 40-70%
      day30Retention: Math.round(20 + Math.random() * 25) // 20-45%
    };

    return {
      communityId: community._id.toString(),
      communityName: community.name,
      membersCount,
      memberGrowth,
      engagementMetrics: {
        activeMembers,
        engagementRate,
        averageSessionDuration
      },
      revenueMetrics: {
        totalRevenue,
        monthlyRecurringRevenue,
        averageRevenuePerUser
      },
      contentMetrics,
      retentionMetrics,
      period: {
        startDate,
        endDate
      }
    };
  }

  /**
   * Transform community document to response DTO
   * Private helper method for data transformation
   */
  private transformCommunityToDto(community: CommunityDocument, contentCount?: number): CommunityResponseDto {
    const creator = community.createur as any;
    const communityAny = community as any;
    
    // Derive admin status from runtime visibility first, then moderation metadata.
    // Many legacy communities were published (isActive=true) while approvalStatus remained "pending".
    let status = 'inactive';
    if (communityAny.isSuspended) status = 'suspended';
    else if (communityAny.approvalStatus === 'rejected') status = 'rejected';
    else if (community.isActive) status = 'active';
    else if (communityAny.approvalStatus === 'pending' || !communityAny.approvalStatus) status = 'pending';

    return {
      _id: community._id.toString(),
      name: community.name,
      slug: community.slug,
      description: community.short_description,
      category: community.category,
      logo: community.logo,
      coverImage: community.photo_de_couverture || community.coverImage || '',
      creator: {
        id: creator?._id?.toString() || creator?.toString() || 'unknown',
        name: creator?.name || 'Unknown Creator',
        username: creator?.name || 'Unknown User',
        email: creator?.email || '',
        avatar: creator?.profile_picture || creator?.photo_profil || creator?.avatar || '',
        verified: creator?.verified || false
      },
      status: status as any, // This ensures status is always populated for frontend
      membersCount: community.membersCount || community.members?.length || 0,
      contentCount: contentCount || 0,
      isActive: community.isActive,
      isPrivate: community.isPrivate,
      isVerified: community.isVerified,
      featured: community.featured,
      priceType: community.priceType,
      price: community.price || community.fees_of_join || 0,
      currency: community.currency,
      rating: (community as any).averageRating || community.rating || 0,
      ratingCount: (community as any).ratingCount || 0,
      tags: community.tags,
      stats: {
        totalRevenue: community.stats?.totalRevenue || 0,
        monthlyGrowth: community.stats?.monthlyGrowth || 0,
        engagementRate: community.stats?.engagementRate || 0,
        retentionRate: community.stats?.retentionRate || 0
      },
      createdAt: community.createdAt,
      updatedAt: community.updatedAt,
      adminNotes: (community as any).adminNotes,
      approvalStatus: (community as any).approvalStatus,
      approvedBy: (community as any).approvedBy?.toString(),
      approvedAt: (community as any).approvedAt,
      rejectionReason: (community as any).rejectionReason
    };
  }

  /**
   * Get detailed community analytics with enhanced metrics
   * Requirement 2.6: Community analytics and reporting
   */
  async getDetailedCommunityAnalytics(
    communityId: string,
    period: TimePeriod = TimePeriod.LAST_30_DAYS,
    customStartDate?: Date,
    customEndDate?: Date,
    adminUserId?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<DetailedCommunityAnalyticsDto> {
    try {
      const community = await this.communityModel.findById(communityId);
      if (!community) {
        throw new NotFoundException('Community not found');
      }

      // Calculate date range
      const { startDate, endDate } = this.calculateDateRange(period, customStartDate, customEndDate);

      // Calculate detailed analytics
      const analytics = await this.calculateDetailedAnalytics(community, startDate, endDate);

      // Log admin action if admin context provided
      if (adminUserId && ipAddress && userAgent) {
        await this.auditLogService.logAction({
          adminUserId: new Types.ObjectId(adminUserId),
          action: AdminAction.COMMUNITY_VIEW,
          entityType: 'DetailedCommunityAnalytics',
          entityId: community._id,
          ipAddress,
          userAgent,
          metadata: {
            period,
            startDate,
            endDate,
            communityName: community.name,
            analyticsType: 'detailed'
          }
        });
      }

      return analytics;

    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Error fetching detailed community analytics:', error);
      throw new InternalServerErrorException('Failed to fetch detailed community analytics');
    }
  }

  /**
   * Get analytics summary for all communities
   * Requirement 2.6: Community analytics and reporting
   */
  async getCommunityAnalyticsSummary(
    filters: CommunityAnalyticsFiltersDto,
    adminUserId: string,
    ipAddress: string,
    userAgent: string
  ): Promise<CommunityAnalyticsSummaryDto> {
    try {
      // Build query based on filters
      const query: any = {};
      
      if (filters.activeOnly) {
        query.isActive = true;
      }
      
      if (filters.verifiedOnly) {
        query.isVerified = true;
      }
      
      if (filters.category) {
        query.category = { $regex: filters.category, $options: 'i' };
      }
      
      if (filters.creatorId) {
        query.createur = new Types.ObjectId(filters.creatorId);
      }
      
      if (filters.minMembers !== undefined || filters.maxMembers !== undefined) {
        query.membersCount = {};
        if (filters.minMembers !== undefined) {
          query.membersCount.$gte = filters.minMembers;
        }
        if (filters.maxMembers !== undefined) {
          query.membersCount.$lte = filters.maxMembers;
        }
      }

      // Get communities
      const communities = await this.communityModel.find(query).limit(100); // Limit for performance

      // Calculate date range
      const { startDate, endDate } = this.calculateDateRange(
        (filters.period || TimePeriod.LAST_30_DAYS) as TimePeriod,
        filters.startDate ? new Date(filters.startDate) : undefined,
        filters.endDate ? new Date(filters.endDate) : undefined
      );

      // Calculate summary metrics
      const summary = await this.calculateSummaryAnalytics(communities, startDate, endDate);

      // Log admin action
      await this.auditLogService.logAction({
        adminUserId: new Types.ObjectId(adminUserId),
        action: AdminAction.COMMUNITY_VIEW,
        entityType: 'CommunityAnalyticsSummary',
        entityId: new Types.ObjectId(), // No specific entity for summary
        ipAddress,
        userAgent,
        metadata: {
          filters,
          startDate,
          endDate,
          communitiesAnalyzed: communities.length,
          analyticsType: 'summary'
        }
      });

      return summary;

    } catch (error) {
      console.error('Error fetching community analytics summary:', error);
      throw new InternalServerErrorException('Failed to fetch community analytics summary');
    }
  }

  /**
   * Compare two communities analytics
   * Requirement 2.6: Community analytics and reporting
   */
  async compareCommunities(
    communityAId: string,
    communityBId: string,
    period: TimePeriod = TimePeriod.LAST_30_DAYS,
    adminUserId: string,
    ipAddress: string,
    userAgent: string
  ): Promise<CommunityComparisonDto> {
    try {
      // Get detailed analytics for both communities
      const [analyticsA, analyticsB] = await Promise.all([
        this.getDetailedCommunityAnalytics(communityAId, period),
        this.getDetailedCommunityAnalytics(communityBId, period)
      ]);

      // Calculate comparison insights
      const comparison = this.calculateComparisonInsights(analyticsA, analyticsB);

      // Log admin action
      await this.auditLogService.logAction({
        adminUserId: new Types.ObjectId(adminUserId),
        action: AdminAction.COMMUNITY_VIEW,
        entityType: 'CommunityComparison',
        entityId: new Types.ObjectId(), // No specific entity for comparison
        ipAddress,
        userAgent,
        metadata: {
          communityAId,
          communityBId,
          period,
          analyticsType: 'comparison'
        }
      });

      return {
        communityA: analyticsA,
        communityB: analyticsB,
        comparison
      };

    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Error comparing communities:', error);
      throw new InternalServerErrorException('Failed to compare communities');
    }
  }

  /**
   * Calculate date range based on period
   * Private helper method
   */
  private calculateDateRange(
    period: TimePeriod,
    customStartDate?: Date,
    customEndDate?: Date
  ): { startDate: Date; endDate: Date } {
    const endDate = customEndDate || new Date();
    const startDate = customStartDate || new Date();
    
    if (!customStartDate) {
      switch (period) {
        case TimePeriod.LAST_7_DAYS:
          startDate.setDate(endDate.getDate() - 7);
          break;
        case TimePeriod.LAST_30_DAYS:
          startDate.setDate(endDate.getDate() - 30);
          break;
        case TimePeriod.LAST_90_DAYS:
          startDate.setDate(endDate.getDate() - 90);
          break;
        case TimePeriod.LAST_YEAR:
          startDate.setFullYear(endDate.getFullYear() - 1);
          break;
        default:
          startDate.setDate(endDate.getDate() - 30);
      }
    }

    return { startDate, endDate };
  }

  /**
   * Calculate detailed analytics for a community
   * Private helper method with enhanced metrics
   */
  private async calculateDetailedAnalytics(
    community: CommunityDocument,
    startDate: Date,
    endDate: Date
  ): Promise<DetailedCommunityAnalyticsDto> {
    const membersCount = community.membersCount || 0;
    const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    
    // Enhanced growth metrics
    const dailyGrowth = Math.floor(membersCount * 0.01 + Math.random() * 5);
    const weeklyGrowth = Math.floor(membersCount * 0.05 + Math.random() * 20);
    const monthlyGrowth = Math.floor(membersCount * 0.15 + Math.random() * 50);
    const growthRate = monthlyGrowth > 0 ? (monthlyGrowth / Math.max(membersCount - monthlyGrowth, 1)) * 100 : 0;
    
    const growthMetrics: CommunityGrowthMetricsDto = {
      daily: dailyGrowth,
      weekly: weeklyGrowth,
      monthly: monthlyGrowth,
      growthRate: Math.round(growthRate * 100) / 100,
      trend: growthRate > 5 ? 'positive' : growthRate < -2 ? 'negative' : 'stable'
    };

    // Enhanced engagement metrics
    const activeMembers = Math.floor(membersCount * (0.2 + Math.random() * 0.3));
    const engagementRate = Math.round((activeMembers / Math.max(membersCount, 1)) * 100);
    const averageSessionDuration = Math.floor(300 + Math.random() * 1200);
    const postsPerMember = Math.round((Math.random() * 3 + 0.5) * 100) / 100;
    const commentsPerPost = Math.round((Math.random() * 5 + 2) * 100) / 100;
    const interactionScore = Math.round((engagementRate * 0.4 + postsPerMember * 20 + commentsPerPost * 10) * 100) / 100;

    const engagementMetrics: CommunityEngagementMetricsDto = {
      activeMembers,
      engagementRate,
      averageSessionDuration,
      postsPerMember,
      commentsPerPost,
      interactionScore
    };

    // Enhanced revenue metrics
    const baseRevenue = community.fees_of_join || 0;
    const totalRevenue = Math.floor(baseRevenue * membersCount * (0.8 + Math.random() * 0.4));
    const monthlyRecurringRevenue = community.priceType === 'monthly' ? Math.floor(totalRevenue * 0.7) : 0;
    const averageRevenuePerUser = membersCount > 0 ? Math.floor(totalRevenue / membersCount) : 0;
    const revenueGrowthRate = Math.round((Math.random() * 20 - 5) * 100) / 100; // -5% to +15%
    const conversionRate = Math.round((Math.random() * 15 + 5) * 100) / 100; // 5% to 20%
    const churnRate = Math.round((Math.random() * 10 + 2) * 100) / 100; // 2% to 12%

    const revenueMetrics: CommunityRevenueMetricsDto = {
      totalRevenue,
      monthlyRecurringRevenue,
      averageRevenuePerUser,
      revenueGrowthRate,
      conversionRate,
      churnRate
    };

    // Enhanced content metrics
    const totalPosts = Math.floor(membersCount * (0.5 + Math.random() * 2));
    const totalCourses = Math.floor(Math.random() * 10);
    const totalEvents = Math.floor(Math.random() * 5);
    const totalProducts = Math.floor(Math.random() * 3);
    const contentCreationRate = Math.round((totalPosts + totalCourses + totalEvents + totalProducts) / daysDiff * 100) / 100;
    const contentTypes = ['posts', 'courses', 'events', 'products'];
    const popularContentType = contentTypes[Math.floor(Math.random() * contentTypes.length)];

    const contentMetrics: CommunityContentMetricsDto = {
      totalPosts,
      totalCourses,
      totalEvents,
      totalProducts,
      contentCreationRate,
      popularContentType
    };

    // Enhanced retention metrics
    const day1Retention = Math.round((70 + Math.random() * 25) * 100) / 100;
    const day7Retention = Math.round((40 + Math.random() * 30) * 100) / 100;
    const day30Retention = Math.round((20 + Math.random() * 25) * 100) / 100;
    const averageLifetime = Math.floor(30 + Math.random() * 200); // 30-230 days
    const satisfactionScore = Math.round(((community as any).averageRating || 0) * 20); // Convert 5-star to 100-point scale

    const retentionMetrics: CommunityRetentionMetricsDto = {
      day1Retention,
      day7Retention,
      day30Retention,
      averageLifetime,
      satisfactionScore
    };

    // Performance metrics
    const healthScore = Math.round((engagementRate * 0.3 + day30Retention * 0.3 + satisfactionScore * 0.4) * 100) / 100;
    const activityLevel = engagementRate > 60 ? 'high' : engagementRate > 30 ? 'medium' : 'low';
    const qualityScore = Math.round(((community as any).averageRating || 0) * 20);
    const moderationScore = Math.round((80 + Math.random() * 20) * 100) / 100; // Mock score
    const performanceRating = Math.round((healthScore + qualityScore + moderationScore) / 3 * 100) / 100;

    const performanceMetrics: CommunityPerformanceMetricsDto = {
      healthScore,
      activityLevel,
      qualityScore,
      moderationScore,
      performanceRating
    };

    return {
      communityId: community._id.toString(),
      communityName: community.name,
      communitySlug: community.slug,
      category: community.category,
      membersCount,
      createdAt: community.createdAt,
      growthMetrics,
      engagementMetrics,
      revenueMetrics,
      contentMetrics,
      retentionMetrics,
      performanceMetrics,
      period: {
        startDate,
        endDate,
        periodType: TimePeriod.LAST_30_DAYS // This should be passed as parameter
      },
      lastUpdated: new Date()
    };
  }

  /**
   * Calculate summary analytics for multiple communities
   * Private helper method
   */
  private async calculateSummaryAnalytics(
    communities: CommunityDocument[],
    startDate: Date,
    endDate: Date
  ): Promise<CommunityAnalyticsSummaryDto> {
    const totalCommunities = communities.length;
    const totalMembers = communities.reduce((sum, c) => sum + (c.membersCount || 0), 0);
    const totalRevenue = communities.reduce((sum, c) => {
      const revenue = (c.fees_of_join || 0) * (c.membersCount || 0);
      return sum + revenue;
    }, 0);

    // Calculate average engagement rate (mock calculation)
    const averageEngagementRate = Math.round(
      communities.reduce((sum, c) => {
        const members = c.membersCount || 0;
        const engagement = Math.floor(members * (0.2 + Math.random() * 0.3));
        return sum + (engagement / Math.max(members, 1)) * 100;
      }, 0) / Math.max(totalCommunities, 1) * 100
    ) / 100;

    // Get top performing communities (by member count)
    const topCommunities = communities
      .sort((a, b) => (b.membersCount || 0) - (a.membersCount || 0))
      .slice(0, 5)
      .map(c => c.name);

    // Get communities needing attention (low member count or inactive)
    const communitiesNeedingAttention = communities
      .filter(c => (c.membersCount || 0) < 10 || !c.isActive)
      .slice(0, 5)
      .map(c => c.name);

    // Growth trends (mock calculation)
    const growthTrends = {
      growing: Math.floor(totalCommunities * 0.6),
      stable: Math.floor(totalCommunities * 0.3),
      declining: Math.floor(totalCommunities * 0.1)
    };

    // Revenue and members by category
    const revenueByCategory: Record<string, number> = {};
    const membersByCategory: Record<string, number> = {};

    communities.forEach(c => {
      const category = c.category || 'Other';
      const revenue = (c.fees_of_join || 0) * (c.membersCount || 0);
      
      revenueByCategory[category] = (revenueByCategory[category] || 0) + revenue;
      membersByCategory[category] = (membersByCategory[category] || 0) + (c.membersCount || 0);
    });

    return {
      totalCommunities,
      totalMembers,
      totalRevenue,
      averageEngagementRate,
      topCommunities,
      communitiesNeedingAttention,
      growthTrends,
      revenueByCategory,
      membersByCategory,
      period: {
        startDate,
        endDate,
        periodType: TimePeriod.LAST_30_DAYS
      }
    };
  }

  /**
   * Calculate comparison insights between two communities
   * Private helper method
   */
  private calculateComparisonInsights(
    analyticsA: DetailedCommunityAnalyticsDto,
    analyticsB: DetailedCommunityAnalyticsDto
  ): any {
    const memberGrowthDifference = analyticsA.growthMetrics.monthly - analyticsB.growthMetrics.monthly;
    const engagementDifference = analyticsA.engagementMetrics.engagementRate - analyticsB.engagementMetrics.engagementRate;
    const revenueDifference = analyticsA.revenueMetrics.totalRevenue - analyticsB.revenueMetrics.totalRevenue;
    const performanceDifference = analyticsA.performanceMetrics.performanceRating - analyticsB.performanceMetrics.performanceRating;

    // Determine winner based on overall performance
    let winner: 'A' | 'B' | 'tie' = 'tie';
    const scoreA = analyticsA.performanceMetrics.performanceRating;
    const scoreB = analyticsB.performanceMetrics.performanceRating;
    
    if (Math.abs(scoreA - scoreB) > 5) {
      winner = scoreA > scoreB ? 'A' : 'B';
    }

    // Generate insights
    const insights: string[] = [];
    
    if (Math.abs(memberGrowthDifference) > 10) {
      const better = memberGrowthDifference > 0 ? analyticsA.communityName : analyticsB.communityName;
      insights.push(`${better} has significantly better member growth`);
    }
    
    if (Math.abs(engagementDifference) > 10) {
      const better = engagementDifference > 0 ? analyticsA.communityName : analyticsB.communityName;
      insights.push(`${better} has higher member engagement`);
    }
    
    if (Math.abs(revenueDifference) > 1000) {
      const better = revenueDifference > 0 ? analyticsA.communityName : analyticsB.communityName;
      insights.push(`${better} generates more revenue`);
    }

    return {
      memberGrowthDifference: Math.round(memberGrowthDifference * 100) / 100,
      engagementDifference: Math.round(engagementDifference * 100) / 100,
      revenueDifference: Math.round(revenueDifference * 100) / 100,
      performanceDifference: Math.round(performanceDifference * 100) / 100,
      winner,
      insights
    };
  }

  /**
   * Transform community document to approval request DTO
   * Private helper method for approval queue data transformation
   */
  private transformCommunityToApprovalDto(community: CommunityDocument): CommunityApprovalRequestDto {
    const creator = community.createur as any;
    
    return {
      _id: community._id.toString(),
      name: community.name,
      slug: community.slug,
      description: community.short_description,
      category: community.category,
      logo: community.logo,
      coverImage: community.photo_de_couverture || (community as any).coverImage || '',
      creator: {
        id: creator._id?.toString() || creator.toString(),
        name: creator.name || 'Unknown Creator',
        username: creator.name || 'Unknown User',
        email: creator.email || '',
        avatar: creator.profile_picture || creator.photo_profil || creator.avatar || '',
        verified: creator.verified || false
      },
      priceType: community.priceType,
      price: community.price || community.fees_of_join || 0,
      currency: community.currency,
      tags: community.tags,
      submittedAt: community.createdAt,
      status: (community as any).approvalStatus || 'pending',
      reviewedBy: (community as any).approvedBy?.toString(),
      reviewedAt: (community as any).approvedAt,
      reviewNotes: (community as any).adminNotes
    };
  }
}
