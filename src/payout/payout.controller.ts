import { Controller, Get, Post, Put, Patch, Delete, UseGuards, Request, Body, Param, Query, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, ApiQuery, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PayoutService } from './payout.service';
import { Payout, PayoutStatus, PayoutMethod } from '../schema/payout.schema';
import { UpdateBankCredentialsDto } from './dto/update-bank-credentials.dto';
import { CommunityPermissionGuard } from '../community-access/community-permission.guard';
import { RequireCommunityPermission, OptionalCommunityPermission } from '../community-access/community-permission.decorator';
import { CommunityPermission } from '../common/permissions';

export interface CreatePayoutDto {
  amount: number;
  method: PayoutMethod;
  description?: string;
  itemsCount?: number;
  communityId: string;
}

export interface UpdatePayoutDto {
  status?: PayoutStatus;
  adminNotes?: string;
}

@ApiTags('Payouts')
@Controller('payouts')
export class PayoutController {
  constructor(private readonly payoutService: PayoutService) {}

  @Post()
  @UseGuards(JwtAuthGuard, CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.FINANCE_VIEW)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Request a new payout for the current creator' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        amount: { type: 'number', example: 1000 },
        method: { 
          type: 'string', 
          enum: Object.values(PayoutMethod),
          example: PayoutMethod.BANK_TRANSFER
        },
        description: { type: 'string', example: 'Monthly earnings' },
        itemsCount: { type: 'number', example: 10 },
        communityId: { type: 'string', example: '64fa...' }
      },
      required: ['amount', 'method', 'communityId']
    }
  })
  @ApiResponse({ status: 201, description: 'Payout requested successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 404, description: 'Creator not found' })
  async requestPayout(
    @Request() req: any,
    @Body() createPayoutDto: CreatePayoutDto
  ): Promise<Payout> {
    const creatorId = req.user._id || req.user.sub;
    
    return this.payoutService.createPayout({
      creatorId,
      ...createPayoutDto
    });
  }

  @Get()
  @UseGuards(JwtAuthGuard, CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.FINANCE_VIEW)
  @OptionalCommunityPermission()
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get all payouts for the current creator with pagination and filtering' })
  @ApiQuery({ name: 'status', required: false, enum: Object.values(PayoutStatus) })
  @ApiQuery({ name: 'method', required: false, enum: Object.values(PayoutMethod) })
  @ApiQuery({ name: 'page', required: false, type: 'number', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: 'number', example: 20 })
  @ApiQuery({ name: 'startDate', required: false, type: 'string', format: 'date' })
  @ApiQuery({ name: 'endDate', required: false, type: 'string', format: 'date' })
  @ApiQuery({ name: 'communityId', required: false, type: 'string', description: 'Filter by community' })
  async getPayouts(
    @Request() req: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('method') method?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('communityId') communityId?: string
  ): Promise<any> {
    const creatorId = req.user._id || req.user.sub;
    
    return this.payoutService.getPayouts({
      creatorId,
      communityId,
      status: status as PayoutStatus | undefined,
      method: method as PayoutMethod | undefined,
      page,
      limit,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined
    });
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard, CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.FINANCE_VIEW)
  @OptionalCommunityPermission()
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get payout statistics for the current creator' })
  @ApiQuery({ name: 'communityId', required: false, type: 'string', description: 'Filter by community' })
  async getPayoutStats(@Request() req: any, @Query('communityId') communityId?: string): Promise<any> {
    const creatorId = req.user._id || req.user.sub;
    return this.payoutService.getPayoutStats(creatorId, communityId);
  }

  @Get('available-balance')
  @UseGuards(JwtAuthGuard, CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.FINANCE_VIEW)
  @OptionalCommunityPermission()
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get available balance for the current creator' })
  @ApiQuery({ name: 'communityId', required: false, type: 'string', description: 'Filter by community' })
  async getAvailableBalance(@Request() req: any, @Query('communityId') communityId?: string): Promise<{ availableBalance: number }> {
    const creatorId = req.user._id || req.user.sub;
    
    const result = await this.payoutService.getPayoutsByCreator(creatorId, { communityId });
    return {
      availableBalance: result.availableBalance
    };
  }

  @Get('bank-credentials')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get current creator bank credentials used for payouts' })
  async getBankCredentials(@Request() req: any): Promise<{
    isConfigured: boolean;
    bankDetails: { rib: string; bankName: string; ownerName: string } | null;
  }> {
    const creatorId = req.user._id || req.user.sub;
    return this.payoutService.getCreatorBankCredentials(creatorId);
  }

  @Put('bank-credentials')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update creator Tunisian bank credentials for payouts' })
  async updateBankCredentials(
    @Request() req: any,
    @Body() updateBankCredentialsDto: UpdateBankCredentialsDto,
  ): Promise<{
    isConfigured: boolean;
    bankDetails: { rib: string; bankName: string; ownerName: string };
  }> {
    const creatorId = req.user._id || req.user.sub;
    return this.payoutService.updateCreatorBankCredentials(creatorId, updateBankCredentialsDto);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get a specific payout by ID' })
  @ApiResponse({ status: 200, description: 'Payout found' })
  @ApiResponse({ status: 404, description: 'Payout not found' })
  async getPayoutById(@Param('id') payoutId: string): Promise<Payout | null> {
    return this.payoutService.getPayout(payoutId);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update a payout (admin only)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: Object.values(PayoutStatus) },
        adminNotes: { type: 'string' }
      }
    }
  })
  async updatePayout(
    @Param('id') payoutId: string,
    @Body() updateDto: UpdatePayoutDto
  ): Promise<Payout> {
    return this.payoutService.updatePayout(payoutId, updateDto);
  }

  @Post(':id/process')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Process a payout (mark as completed)' })
  @ApiResponse({ status: 200, description: 'Payout processed successfully' })
  @ApiResponse({ status: 400, description: 'Payout already processed' })
  @ApiResponse({ status: 404, description: 'Payout not found' })
  async processPayout(@Param('id') payoutId: string, @Request() req: any): Promise<Payout> {
    const processedBy = req.user.name || req.user.email || 'Unknown';
    return this.payoutService.processPayout(payoutId, processedBy);
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Cancel a payout' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', example: 'Insufficient funds' }
      }
    }
  })
  @ApiResponse({ status: 200, description: 'Payout cancelled successfully' })
  @ApiResponse({ status: 400, description: 'Cannot cancel completed payout' })
  @ApiResponse({ status: 404, description: 'Payout not found' })
  async cancelPayout(
    @Param('id') payoutId: string,
    @Body('reason') reason: string,
    @Request() req: any
  ): Promise<Payout> {
    const cancelledBy = req.user.name || req.user.email || 'Unknown';
    return this.payoutService.cancelPayout(payoutId, reason, cancelledBy);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete a payout (admin only)' })
  @ApiResponse({ status: 200, description: 'Payout deleted successfully' })
  @ApiResponse({ status: 404, description: 'Payout not found' })
  async deletePayout(@Param('id') payoutId: string): Promise<{ message: string }> {
    await this.payoutService.updatePayout(payoutId, { status: PayoutStatus.CANCELLED });
    return { message: 'Payout cancelled successfully' };
  }
}
