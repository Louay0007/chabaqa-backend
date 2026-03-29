import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Param, 
  Query, 
  Body, 
  UseGuards, 
  Request,
  HttpStatus,
  HttpCode,
  Req
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiParam, 
  ApiQuery,
  ApiBearerAuth,
  ApiBody
} from '@nestjs/swagger';
import { CommunityManagementService } from './community-management.service';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';
import { AdminRolesGuard } from '../common/guards/admin-roles.guard';
import { CommunityManagementAccess } from '../common/decorators/admin-roles.decorator';
import { 
  CommunityFiltersDto, 
  CommunityApprovalFiltersDto 
} from './dto/community-filters.dto';
import { 
  ApproveCommunityDto, 
  RejectCommunityDto, 
  BulkCommunityApprovalDto,
  CommunityModerationDto 
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
  CommunityComparisonDto
} from './dto/community-analytics.dto';
import { AdminRequest, TimePeriod } from '../common/interfaces/admin-interfaces';

@ApiTags('Admin - Community Management')
@ApiBearerAuth()
@Controller('admin/communities')
@UseGuards(AdminAuthGuard, AdminRolesGuard)
@CommunityManagementAccess()
export class CommunityManagementController {
  constructor(
    private readonly communityManagementService: CommunityManagementService
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get Communities',
    description: 'Retrieve communities with advanced filtering, search, and pagination'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Communities retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Communities retrieved successfully' },
        data: {
          type: 'object',
          properties: {
            data: { type: 'array', items: { $ref: '#/components/schemas/CommunityResponseDto' } },
            total: { type: 'number', example: 150 },
            page: { type: 'number', example: 1 },
            limit: { type: 'number', example: 20 },
            totalPages: { type: 'number', example: 8 },
            hasNextPage: { type: 'boolean', example: true },
            hasPrevPage: { type: 'boolean', example: false }
          }
        }
      }
    }
  })
  async getCommunities(
    @Query() filters: CommunityFiltersDto,
    @Req() req: ExpressRequest & AdminRequest
  ) {
    const result = await this.communityManagementService.getCommunities(
      filters,
      req.user.id,
      req.ip || req.socket?.remoteAddress || 'unknown',
      req.get('user-agent') || 'unknown'
    );

    return {
      success: true,
      message: 'Communities retrieved successfully',
      data: result
    };
  }

  @Get('pending-approvals')
  @ApiOperation({
    summary: 'Get Pending Community Approvals',
    description: 'Retrieve communities pending approval with filtering and pagination'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Pending approvals retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Pending approvals retrieved successfully' },
        data: {
          type: 'object',
          properties: {
            data: { type: 'array', items: { $ref: '#/components/schemas/CommunityApprovalRequestDto' } },
            total: { type: 'number', example: 25 },
            page: { type: 'number', example: 1 },
            limit: { type: 'number', example: 20 },
            totalPages: { type: 'number', example: 2 },
            hasNextPage: { type: 'boolean', example: true },
            hasPrevPage: { type: 'boolean', example: false }
          }
        }
      }
    }
  })
  async getPendingApprovals(
    @Query() filters: CommunityApprovalFiltersDto,
    @Req() req: ExpressRequest & AdminRequest
  ) {
    const result = await this.communityManagementService.getPendingApprovals(
      filters,
      req.user.id,
      req.ip || req.socket?.remoteAddress || 'unknown',
      req.get('user-agent') || 'unknown'
    );

    return {
      success: true,
      message: 'Pending approvals retrieved successfully',
      data: result
    };
  }

  @Put(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve Community',
    description: 'Approve a pending community and activate it'
  })
  @ApiParam({
    name: 'id',
    description: 'Community ID',
    example: '64a1b2c3d4e5f6789abcdef0'
  })
  @ApiBody({ type: ApproveCommunityDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Community approved successfully',
    type: CommunityResponseDto,
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Community approved successfully' },
        data: { $ref: '#/components/schemas/CommunityResponseDto' }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Community not found'
  })
  async approveCommunity(
    @Param('id') communityId: string,
    @Body() approvalData: ApproveCommunityDto,
    @Req() req: ExpressRequest & AdminRequest
  ) {
    const result = await this.communityManagementService.approveCommunity(
      communityId,
      approvalData,
      req.user.id,
      req.ip || req.socket?.remoteAddress || 'unknown',
      req.get('user-agent') || 'unknown'
    );

    return {
      success: true,
      message: 'Community approved successfully',
      data: result
    };
  }

  @Put(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reject Community',
    description: 'Reject a pending community with reason'
  })
  @ApiParam({
    name: 'id',
    description: 'Community ID',
    example: '64a1b2c3d4e5f6789abcdef0'
  })
  @ApiBody({ type: RejectCommunityDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Community rejected successfully',
    type: CommunityResponseDto,
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Community rejected successfully' },
        data: { $ref: '#/components/schemas/CommunityResponseDto' }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Community not found'
  })
  async rejectCommunity(
    @Param('id') communityId: string,
    @Body() rejectionData: RejectCommunityDto,
    @Req() req: ExpressRequest & AdminRequest
  ) {
    const result = await this.communityManagementService.rejectCommunity(
      communityId,
      rejectionData,
      req.user.id,
      req.ip || req.socket?.remoteAddress || 'unknown',
      req.get('user-agent') || 'unknown'
    );

    return {
      success: true,
      message: 'Community rejected successfully',
      data: result
    };
  }

  @Post('bulk-approval')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bulk Approve/Reject Communities',
    description: 'Approve or reject multiple communities at once'
  })
  @ApiBody({ type: BulkCommunityApprovalDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Bulk operation completed',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Bulk operation completed' },
        data: {
          type: 'object',
          properties: {
            successCount: { type: 'number', example: 8 },
            failureCount: { type: 'number', example: 2 },
            failures: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  communityId: { type: 'string' },
                  error: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid bulk operation data'
  })
  async bulkApproveCommunities(
    @Body() bulkData: BulkCommunityApprovalDto,
    @Req() req: ExpressRequest & AdminRequest
  ) {
    const result = await this.communityManagementService.bulkApproveCommunities(
      bulkData,
      req.user.id,
      req.ip || req.socket?.remoteAddress || 'unknown',
      req.get('user-agent') || 'unknown'
    );

    return {
      success: true,
      message: 'Bulk operation completed',
      data: result
    };
  }

  @Put(':id/moderate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Moderate Community',
    description: 'Update community moderation settings (featured, verified, active status)'
  })
  @ApiParam({
    name: 'id',
    description: 'Community ID',
    example: '64a1b2c3d4e5f6789abcdef0'
  })
  @ApiBody({ type: CommunityModerationDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Community moderated successfully',
    type: CommunityResponseDto,
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Community moderated successfully' },
        data: { $ref: '#/components/schemas/CommunityResponseDto' }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Community not found'
  })
  async moderateCommunity(
    @Param('id') communityId: string,
    @Body() moderationData: CommunityModerationDto,
    @Req() req: ExpressRequest & AdminRequest
  ) {
    const result = await this.communityManagementService.moderateCommunity(
      communityId,
      moderationData,
      req.user.id,
      req.ip || req.socket?.remoteAddress || 'unknown',
      req.get('user-agent') || 'unknown'
    );

    return {
      success: true,
      message: 'Community moderated successfully',
      data: result
    };
  }

  @Get('analytics')
  @ApiOperation({
    summary: 'Get Community Analytics',
    description: 'Retrieve analytics for all communities or a specific community'
  })
  @ApiQuery({
    name: 'communityId',
    required: false,
    description: 'Specific community ID for individual analytics',
    example: '64a1b2c3d4e5f6789abcdef0'
  })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: TimePeriod,
    description: 'Time period for analytics',
    example: TimePeriod.LAST_30_DAYS
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Community analytics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Community analytics retrieved successfully' },
        data: {
          oneOf: [
            { $ref: '#/components/schemas/CommunityAnalyticsDto' },
            {
              type: 'array',
              items: { $ref: '#/components/schemas/CommunityAnalyticsDto' }
            }
          ]
        }
      }
    }
  })
  async getCommunityAnalytics(
    @Query('communityId') communityId: string | undefined,
    @Query('period') period: string,
    @Req() req: ExpressRequest & AdminRequest
  ) {
    const result = await this.communityManagementService.getCommunityAnalytics(
      communityId,
      (period || TimePeriod.LAST_30_DAYS) as TimePeriod,
      req.user.id,
      req.ip || req.socket?.remoteAddress || 'unknown',
      req.get('user-agent') || 'unknown'
    );

    return {
      success: true,
      message: 'Community analytics retrieved successfully',
      data: result
    };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get Community Details',
    description: 'Retrieve detailed information about a specific community'
  })
  @ApiParam({
    name: 'id',
    description: 'Community ID',
    example: '64a1b2c3d4e5f6789abcdef0'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Community details retrieved successfully',
    type: CommunityResponseDto,
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Community details retrieved successfully' },
        data: { $ref: '#/components/schemas/CommunityResponseDto' }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Community not found'
  })
  async getCommunityDetails(
    @Param('id') communityId: string,
    @Req() req: ExpressRequest & AdminRequest
  ) {
    const result = await this.communityManagementService.getCommunityDetails(
      communityId,
      req.user.id,
      req.ip || req.socket?.remoteAddress || 'unknown',
      req.get('user-agent') || 'unknown'
    );

    return {
      success: true,
      message: 'Community details retrieved successfully',
      data: result
    };
  }

  @Get(':id/analytics')
  @ApiOperation({
    summary: 'Get Specific Community Analytics',
    description: 'Retrieve detailed analytics for a specific community'
  })
  @ApiParam({
    name: 'id',
    description: 'Community ID',
    example: '64a1b2c3d4e5f6789abcdef0'
  })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: TimePeriod,
    description: 'Time period for analytics',
    example: TimePeriod.LAST_30_DAYS
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Community analytics retrieved successfully',
    type: CommunityAnalyticsDto,
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Community analytics retrieved successfully' },
        data: { $ref: '#/components/schemas/CommunityAnalyticsDto' }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Community not found'
  })
  async getSpecificCommunityAnalytics(
    @Param('id') communityId: string,
    @Query('period') period: string = TimePeriod.LAST_30_DAYS,
    @Req() req: ExpressRequest & AdminRequest
  ) {
    const result = await this.communityManagementService.getCommunityAnalytics(
      communityId,
      period as TimePeriod,
      req.user.id,
      req.ip || req.socket?.remoteAddress || 'unknown',
      req.get('user-agent') || 'unknown'
    );

    return {
      success: true,
      message: 'Community analytics retrieved successfully',
      data: result
    };
  }

  @Get(':id/detailed-analytics')
  @ApiOperation({
    summary: 'Get Detailed Community Analytics',
    description: 'Retrieve comprehensive analytics with enhanced metrics for a specific community'
  })
  @ApiParam({
    name: 'id',
    description: 'Community ID',
    example: '64a1b2c3d4e5f6789abcdef0'
  })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: TimePeriod,
    description: 'Time period for analytics',
    example: TimePeriod.LAST_30_DAYS
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Custom start date (ISO string)',
    example: '2024-01-01T00:00:00.000Z'
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'Custom end date (ISO string)',
    example: '2024-01-31T23:59:59.999Z'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Detailed community analytics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Detailed community analytics retrieved successfully' },
        data: { $ref: '#/components/schemas/DetailedCommunityAnalyticsDto' }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Community not found'
  })
  async getDetailedCommunityAnalytics(
    @Param('id') communityId: string,
    @Req() req: ExpressRequest & AdminRequest,
    @Query('period') period: string = TimePeriod.LAST_30_DAYS,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    const result = await this.communityManagementService.getDetailedCommunityAnalytics(
      communityId,
      period as TimePeriod,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
      req.user.id,
      req.ip || req.socket?.remoteAddress || 'unknown',
      req.get('user-agent') || 'unknown'
    );

    return {
      success: true,
      message: 'Detailed community analytics retrieved successfully',
      data: result
    };
  }

  @Get('analytics/summary')
  @ApiOperation({
    summary: 'Get Community Analytics Summary',
    description: 'Retrieve analytics summary for all communities with filtering options'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Community analytics summary retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Community analytics summary retrieved successfully' },
        data: { $ref: '#/components/schemas/CommunityAnalyticsSummaryDto' }
      }
    }
  })
  async getCommunityAnalyticsSummary(
    @Query() filters: CommunityAnalyticsFiltersDto,
    @Req() req: ExpressRequest & AdminRequest
  ) {
    const result = await this.communityManagementService.getCommunityAnalyticsSummary(
      filters,
      req.user.id,
      req.ip || req.socket?.remoteAddress || 'unknown',
      req.get('user-agent') || 'unknown'
    );

    return {
      success: true,
      message: 'Community analytics summary retrieved successfully',
      data: result
    };
  }

  @Get('analytics/compare')
  @ApiOperation({
    summary: 'Compare Two Communities',
    description: 'Compare analytics between two communities'
  })
  @ApiQuery({
    name: 'communityA',
    description: 'First community ID',
    example: '64a1b2c3d4e5f6789abcdef0'
  })
  @ApiQuery({
    name: 'communityB',
    description: 'Second community ID',
    example: '64a1b2c3d4e5f6789abcdef1'
  })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: TimePeriod,
    description: 'Time period for comparison',
    example: TimePeriod.LAST_30_DAYS
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Community comparison retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Community comparison retrieved successfully' },
        data: { $ref: '#/components/schemas/CommunityComparisonDto' }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Both community IDs are required'
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'One or both communities not found'
  })
  async compareCommunities(
    @Query('communityA') communityAId: string,
    @Query('communityB') communityBId: string,
    @Query('period') period: string = TimePeriod.LAST_30_DAYS,
    @Req() req: ExpressRequest & AdminRequest
  ) {
    if (!communityAId || !communityBId) {
      return {
        success: false,
        message: 'Both community IDs are required',
        data: null
      };
    }

    const result = await this.communityManagementService.compareCommunities(
      communityAId,
      communityBId,
      period as TimePeriod,
      req.user.id,
      req.ip || req.socket?.remoteAddress || 'unknown',
      req.get('user-agent') || 'unknown'
    );

    return {
      success: true,
      message: 'Community comparison retrieved successfully',
      data: result
    };
  }
}