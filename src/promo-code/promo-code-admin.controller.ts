import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminRolesGuard } from '../admin/common/guards/admin-roles.guard';
import { RequireAdminRoles } from '../admin/common/decorators/admin-roles.decorator';
import { AdminRole } from '../admin/schemas/admin-user.schema';
import { PromoCodeService } from './promo-code.service';
import { CreatePromoCodeDto, UpdatePromoCodeDto, PromoCodeResponseDto, PromoCodeUsageDto, PromoCodeStatsDto } from './dto';

@ApiTags('Admin - Promo Codes')
@Controller('admin/promo-codes')
@UseGuards(JwtAuthGuard, AdminRolesGuard)
@RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.FINANCIAL_MANAGER)
@ApiBearerAuth('JWT-auth')
export class PromoCodeAdminController {
  constructor(private readonly promoCodeService: PromoCodeService) {}

  @Get()
  @ApiOperation({ summary: 'Get all promo codes (Admin)' })
  @ApiQuery({ name: 'creatorId', required: false, description: 'Filter by creator ID' })
  @ApiQuery({ name: 'communityId', required: false, description: 'Filter by community ID' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Filter by active status' })
  @ApiQuery({ name: 'appliesToType', required: false, description: 'Filter by content type' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({ status: 200, description: 'List of all promo codes' })
  async getAllPromoCodes(
    @Query('creatorId') creatorId?: string,
    @Query('communityId') communityId?: string,
    @Query('isActive') isActive?: boolean,
    @Query('appliesToType') appliesToType?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ): Promise<{
    data: PromoCodeResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    return this.promoCodeService.findAll({
      creatorId,
      communityId,
      isActive,
      appliesToType,
      page,
      limit,
    });
  }

  @Post()
  @ApiOperation({ summary: 'Create a new promo code (Admin)' })
  @ApiResponse({ status: 201, type: PromoCodeResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 409, description: 'Promo code already exists' })
  async create(@Body() createDto: CreatePromoCodeDto): Promise<PromoCodeResponseDto> {
    return this.promoCodeService.create(createDto);
  }

  @Get('code/:code')
  @ApiOperation({ summary: 'Get a specific promo code by code (Admin)' })
  @ApiParam({ name: 'code', description: 'Promo code', example: 'SUMMER25' })
  @ApiResponse({ status: 200, type: PromoCodeResponseDto })
  @ApiResponse({ status: 404, description: 'Promo code not found' })
  async getByCode(@Param('code') code: string): Promise<PromoCodeResponseDto> {
    return this.promoCodeService.findByCode(code);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific promo code by ID (Admin)' })
  @ApiParam({ name: 'id', description: 'Promo code ID' })
  @ApiResponse({ status: 200, type: PromoCodeResponseDto })
  @ApiResponse({ status: 404, description: 'Promo code not found' })
  async getById(@Param('id') id: string): Promise<PromoCodeResponseDto> {
    return this.promoCodeService.findById(id);
  }

  @Put('code/:code')
  @ApiOperation({ summary: 'Update a promo code (Admin)' })
  @ApiParam({ name: 'code', description: 'Promo code', example: 'SUMMER25' })
  @ApiResponse({ status: 200, type: PromoCodeResponseDto })
  @ApiResponse({ status: 404, description: 'Promo code not found' })
  async update(
    @Param('code') code: string,
    @Body() updateDto: UpdatePromoCodeDto
  ): Promise<PromoCodeResponseDto> {
    return this.promoCodeService.update(code, updateDto);
  }

  @Delete('code/:code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a promo code (Admin)' })
  @ApiParam({ name: 'code', description: 'Promo code', example: 'SUMMER25' })
  @ApiResponse({ status: 200, description: 'Promo code deleted successfully' })
  @ApiResponse({ status: 404, description: 'Promo code not found' })
  async delete(@Param('code') code: string): Promise<{ message: string }> {
    return this.promoCodeService.delete(code);
  }

  @Get('code/:code/stats')
  @ApiOperation({ summary: 'Get usage statistics for a promo code (Admin)' })
  @ApiParam({ name: 'code', description: 'Promo code', example: 'SUMMER25' })
  @ApiResponse({ status: 200, type: PromoCodeStatsDto })
  @ApiResponse({ status: 404, description: 'Promo code not found' })
  async getStats(@Param('code') code: string): Promise<PromoCodeStatsDto> {
    return this.promoCodeService.getStats(code);
  }

  @Get('code/:code/usage')
  @ApiOperation({ summary: 'Get all users who used a specific promo code (Admin)' })
  @ApiParam({ name: 'code', description: 'Promo code', example: 'SUMMER25' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({ status: 200, description: 'List of users who used the promo code' })
  @ApiResponse({ status: 404, description: 'Promo code not found' })
  async getUsage(
    @Param('code') code: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ): Promise<{
    data: PromoCodeUsageDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    return this.promoCodeService.getUsage(code, page, limit);
  }

  @Get('creator/:creatorId')
  @ApiOperation({ summary: 'Get all promo codes for a specific creator (Admin)' })
  @ApiParam({ name: 'creatorId', description: 'Creator user ID' })
  @ApiResponse({ status: 200, type: [PromoCodeResponseDto] })
  async getCreatorPromoCodes(@Param('creatorId') creatorId: string): Promise<PromoCodeResponseDto[]> {
    return this.promoCodeService.getCreatorPromoCodes(creatorId);
  }
}
