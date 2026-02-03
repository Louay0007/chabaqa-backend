import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Query,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { FinancialManagementService } from './financial-management.service';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';
import { AdminRolesGuard } from '../common/guards/admin-roles.guard';
import { RequireAdminRoles } from '../common/decorators/admin-roles.decorator';
import { AdminRole } from '../schemas/admin-user.schema';
import {
  RevenueDashboardQueryDto,
  RevenueMetricsDto,
} from './dto/revenue-dashboard.dto';
import { SubscriptionFiltersDto } from './dto/subscription-filters.dto';
import { TransactionFiltersDto } from './dto/transaction-filters.dto';
import {
  CalculatePayoutDto,
  InitiatePayoutDto,
  PayoutCalculationResultDto,
} from './dto/payout-calculation.dto';
import {
  GenerateFinancialReportDto,
  FinancialReportDto,
} from './dto/financial-report.dto';
import {
  PayoutFiltersDto,
  UpdatePayoutStatusDto,
  ProcessPayoutDto,
  BulkProcessPayoutsDto,
  PayoutSummaryDto,
} from './dto/payout-management.dto';
import {
  FinancialAnalyticsQueryDto,
  RevenueByContentTypeDto,
  TopCreatorsDto,
  RevenueGrowthDto,
  PayoutAnalyticsDto,
  TransactionAnalyticsDto,
  PlatformFeesAnalyticsDto,
  FinancialHealthDto,
} from './dto/financial-analytics.dto';

@ApiTags('Admin - Financial Management')
@ApiBearerAuth()
@Controller('admin/financial')
@UseGuards(AdminAuthGuard, AdminRolesGuard)
export class FinancialManagementController {
  constructor(
    private readonly financialManagementService: FinancialManagementService,
  ) {}

  @Get('revenue-dashboard')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.FINANCIAL_MANAGER)
  @ApiOperation({
    summary: 'Get revenue dashboard metrics',
    description:
      'Retrieve comprehensive revenue metrics for a specified time period including total revenue, subscription revenue, platform fees, and growth rates.',
  })
  @ApiResponse({
    status: 200,
    description: 'Revenue metrics retrieved successfully',
    type: RevenueMetricsDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  async getRevenueDashboard(
    @Query() query: RevenueDashboardQueryDto,
  ): Promise<RevenueMetricsDto> {
    return await this.financialManagementService.getRevenueDashboard(query);
  }

  @Get('subscriptions')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.FINANCIAL_MANAGER)
  @ApiOperation({
    summary: 'Get subscriptions with filtering',
    description:
      'Retrieve paginated list of subscriptions with advanced filtering options including status, plan tier, creator, and date range.',
  })
  @ApiResponse({
    status: 200,
    description: 'Subscriptions retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { type: 'object' },
        },
        total: { type: 'number' },
        page: { type: 'number' },
        limit: { type: 'number' },
        totalPages: { type: 'number' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  async getSubscriptions(@Query() filters: SubscriptionFiltersDto) {
    return await this.financialManagementService.getSubscriptions(filters);
  }

  @Get('transactions')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.FINANCIAL_MANAGER)
  @ApiOperation({
    summary: 'Get transactions with filtering',
    description:
      'Retrieve paginated list of wallet transactions with advanced filtering options including type, user, amount range, and date range.',
  })
  @ApiResponse({
    status: 200,
    description: 'Transactions retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { type: 'object' },
        },
        total: { type: 'number' },
        page: { type: 'number' },
        limit: { type: 'number' },
        totalPages: { type: 'number' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  async getTransactions(@Query() filters: TransactionFiltersDto) {
    return await this.financialManagementService.getTransactions(filters);
  }

  @Post('payouts/calculate')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.FINANCIAL_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Calculate payout for a creator',
    description:
      'Calculate the payout amount for a creator based on community revenue, applying platform fees and providing detailed breakdown.',
  })
  @ApiResponse({
    status: 200,
    description: 'Payout calculated successfully',
    type: PayoutCalculationResultDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid input data',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'Not found - Community or creator not found',
  })
  async calculatePayout(
    @Body() dto: CalculatePayoutDto,
  ): Promise<PayoutCalculationResultDto> {
    return await this.financialManagementService.calculatePayout(dto);
  }

  @Post('payouts/initiate')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.FINANCIAL_MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Initiate a payout transaction',
    description:
      'Create and initiate a payout transaction for a creator, recording the payout details and setting status to pending.',
  })
  @ApiResponse({
    status: 201,
    description: 'Payout initiated successfully',
    schema: {
      type: 'object',
      properties: {
        _id: { type: 'string' },
        communityId: { type: 'string' },
        creatorId: { type: 'string' },
        amount: { type: 'number' },
        currency: { type: 'string' },
        status: { type: 'string' },
        method: { type: 'string' },
        reference: { type: 'string' },
        requestedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid input data',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'Not found - Community or creator not found',
  })
  async initiatePayout(@Body() dto: InitiatePayoutDto, @Req() req) {
    const adminId = req.user.sub;
    return await this.financialManagementService.initiatePayout(dto, adminId);
  }

  @Post('reports/generate')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.FINANCIAL_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate comprehensive financial report',
    description:
      'Generate a detailed financial report including revenue breakdown, payout summary, platform fees, growth analytics, and transaction statistics for a specified period.',
  })
  @ApiResponse({
    status: 200,
    description: 'Financial report generated successfully',
    type: FinancialReportDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid input data',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  async generateFinancialReport(
    @Body() dto: GenerateFinancialReportDto,
  ): Promise<FinancialReportDto> {
    return await this.financialManagementService.generateFinancialReport(dto);
  }

  @Get('payouts')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.FINANCIAL_MANAGER)
  @ApiOperation({
    summary: 'Get payouts with filtering',
    description:
      'Retrieve paginated list of payouts with advanced filtering options including status, method, creator, community, and date range.',
  })
  @ApiResponse({
    status: 200,
    description: 'Payouts retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  async getPayouts(@Query() filters: PayoutFiltersDto) {
    return await this.financialManagementService.getPayouts(filters);
  }

  @Get('payouts/summary')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.FINANCIAL_MANAGER)
  @ApiOperation({
    summary: 'Get payout summary statistics',
    description:
      'Retrieve summary statistics for payouts including counts and amounts by status.',
  })
  @ApiResponse({
    status: 200,
    description: 'Payout summary retrieved successfully',
    type: PayoutSummaryDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  async getPayoutSummary(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<PayoutSummaryDto> {
    const filters = {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    };
    return await this.financialManagementService.getPayoutSummary(filters);
  }

  @Get('payouts/:id')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.FINANCIAL_MANAGER)
  @ApiOperation({
    summary: 'Get payout details by ID',
    description: 'Retrieve detailed information about a specific payout.',
  })
  @ApiResponse({
    status: 200,
    description: 'Payout details retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'Not found - Payout not found',
  })
  async getPayoutById(@Param('id') id: string) {
    return await this.financialManagementService.getPayoutById(id);
  }

  @Post('payouts/:id/process')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.FINANCIAL_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Process a payout',
    description:
      'Mark a payout as processed and completed, updating its status and recording the processing timestamp.',
  })
  @ApiResponse({
    status: 200,
    description: 'Payout processed successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid payout status for processing',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'Not found - Payout not found',
  })
  async processPayout(
    @Param('id') id: string,
    @Body() dto: ProcessPayoutDto,
    @Req() req,
  ) {
    const adminId = req.user.sub;
    return await this.financialManagementService.processPayout(
      { ...dto, payoutId: id },
      adminId,
    );
  }

  @Post('payouts/bulk-process')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.FINANCIAL_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Process multiple payouts in bulk',
    description:
      'Process multiple payouts at once, marking them as completed and recording processing timestamps.',
  })
  @ApiResponse({
    status: 200,
    description: 'Bulk payout processing completed',
    schema: {
      type: 'object',
      properties: {
        successCount: { type: 'number' },
        failureCount: { type: 'number' },
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              payoutId: { type: 'string' },
              success: { type: 'boolean' },
              error: { type: 'string' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  async bulkProcessPayouts(@Body() dto: BulkProcessPayoutsDto, @Req() req) {
    const adminId = req.user.sub;
    return await this.financialManagementService.bulkProcessPayouts(
      dto,
      adminId,
    );
  }

  @Patch('payouts/:id/status')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.FINANCIAL_MANAGER)
  @ApiOperation({
    summary: 'Update payout status',
    description: 'Update the status of a payout with optional admin notes.',
  })
  @ApiResponse({
    status: 200,
    description: 'Payout status updated successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'Not found - Payout not found',
  })
  async updatePayoutStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePayoutStatusDto,
    @Req() req,
  ) {
    const adminId = req.user.sub;
    return await this.financialManagementService.updatePayoutStatus(
      id,
      dto,
      adminId,
    );
  }

  @Post('payouts/:id/cancel')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.FINANCIAL_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel a payout',
    description: 'Cancel a pending or scheduled payout with a reason.',
  })
  @ApiResponse({
    status: 200,
    description: 'Payout cancelled successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Cannot cancel completed payout',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'Not found - Payout not found',
  })
  async cancelPayout(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Req() req,
  ) {
    const adminId = req.user.sub;
    return await this.financialManagementService.cancelPayout(
      id,
      reason,
      adminId,
    );
  }

  @Get('analytics/revenue-by-content-type')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.FINANCIAL_MANAGER, AdminRole.ANALYTICS_VIEWER)
  @ApiOperation({
    summary: 'Get revenue breakdown by content type',
    description:
      'Retrieve revenue analytics broken down by content type (community, course, event, product, session, challenge).',
  })
  @ApiResponse({
    status: 200,
    description: 'Revenue by content type retrieved successfully',
    type: RevenueByContentTypeDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  async getRevenueByContentType(
    @Query() query: FinancialAnalyticsQueryDto,
  ): Promise<RevenueByContentTypeDto> {
    return await this.financialManagementService.getRevenueByContentType(query);
  }

  @Get('analytics/top-creators')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.FINANCIAL_MANAGER, AdminRole.ANALYTICS_VIEWER)
  @ApiOperation({
    summary: 'Get top revenue-generating creators',
    description:
      'Retrieve list of top creators by revenue with transaction counts and payout information.',
  })
  @ApiResponse({
    status: 200,
    description: 'Top creators retrieved successfully',
    type: [TopCreatorsDto],
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  async getTopCreators(
    @Query() query: FinancialAnalyticsQueryDto,
  ): Promise<TopCreatorsDto[]> {
    return await this.financialManagementService.getTopCreators(
      query,
      query.limit || 10,
    );
  }

  @Get('analytics/revenue-growth')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.FINANCIAL_MANAGER, AdminRole.ANALYTICS_VIEWER)
  @ApiOperation({
    summary: 'Get revenue growth analytics',
    description:
      'Retrieve revenue growth metrics comparing current period to previous period.',
  })
  @ApiResponse({
    status: 200,
    description: 'Revenue growth analytics retrieved successfully',
    type: RevenueGrowthDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  async getRevenueGrowth(
    @Query() query: FinancialAnalyticsQueryDto,
  ): Promise<RevenueGrowthDto> {
    return await this.financialManagementService.getRevenueGrowth(query);
  }

  @Get('analytics/payout-analytics')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.FINANCIAL_MANAGER, AdminRole.ANALYTICS_VIEWER)
  @ApiOperation({
    summary: 'Get payout analytics',
    description:
      'Retrieve comprehensive payout analytics including completion rates, processing times, and method breakdown.',
  })
  @ApiResponse({
    status: 200,
    description: 'Payout analytics retrieved successfully',
    type: PayoutAnalyticsDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  async getPayoutAnalytics(
    @Query() query: FinancialAnalyticsQueryDto,
  ): Promise<PayoutAnalyticsDto> {
    return await this.financialManagementService.getPayoutAnalytics(query);
  }

  @Get('analytics/transaction-analytics')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.FINANCIAL_MANAGER, AdminRole.ANALYTICS_VIEWER)
  @ApiOperation({
    summary: 'Get transaction analytics',
    description:
      'Retrieve transaction analytics including volume, growth rates, and type breakdown.',
  })
  @ApiResponse({
    status: 200,
    description: 'Transaction analytics retrieved successfully',
    type: TransactionAnalyticsDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  async getTransactionAnalytics(
    @Query() query: FinancialAnalyticsQueryDto,
  ): Promise<TransactionAnalyticsDto> {
    return await this.financialManagementService.getTransactionAnalytics(query);
  }

  @Get('analytics/platform-fees')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.FINANCIAL_MANAGER, AdminRole.ANALYTICS_VIEWER)
  @ApiOperation({
    summary: 'Get platform fees analytics',
    description:
      'Retrieve platform fees analytics including total fees, growth rates, and breakdown by content type.',
  })
  @ApiResponse({
    status: 200,
    description: 'Platform fees analytics retrieved successfully',
    type: PlatformFeesAnalyticsDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  async getPlatformFeesAnalytics(
    @Query() query: FinancialAnalyticsQueryDto,
  ): Promise<PlatformFeesAnalyticsDto> {
    return await this.financialManagementService.getPlatformFeesAnalytics(query);
  }

  @Get('analytics/financial-health')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.FINANCIAL_MANAGER, AdminRole.ANALYTICS_VIEWER)
  @ApiOperation({
    summary: 'Get financial health indicators',
    description:
      'Retrieve overall financial health indicators with scores, status indicators, and recommendations.',
  })
  @ApiResponse({
    status: 200,
    description: 'Financial health indicators retrieved successfully',
    type: FinancialHealthDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  async getFinancialHealth(
    @Query() query: FinancialAnalyticsQueryDto,
  ): Promise<FinancialHealthDto> {
    return await this.financialManagementService.getFinancialHealth(query);
  }
}
