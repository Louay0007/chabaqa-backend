import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PromoCodeService } from './promo-code.service';
import { CreatePromoCodeDto, UpdatePromoCodeDto, PromoCodeResponseDto, PromoCodeUsageDto, PromoCodeStatsDto } from './dto';

@ApiTags('Promo Codes')
@Controller('promo-codes')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class PromoCodeController {
  constructor(private readonly promoCodeService: PromoCodeService) {}

  // ============ CREATOR ENDPOINTS ============

  @Post()
  @ApiOperation({ summary: 'Create a new promo code (Creator)' })
  @ApiResponse({ status: 201, type: PromoCodeResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 409, description: 'Promo code already exists' })
  async create(
    @Request() req: any,
    @Body() createDto: CreatePromoCodeDto
  ): Promise<PromoCodeResponseDto> {
    const creatorId = req.user._id || req.user.sub;
    return this.promoCodeService.create(createDto, creatorId.toString());
  }

  @Get('my-codes')
  @ApiOperation({ summary: 'Get all promo codes created by current user (Creator)' })
  @ApiResponse({ status: 200, type: [PromoCodeResponseDto] })
  async getMyPromoCodes(@Request() req: any): Promise<PromoCodeResponseDto[]> {
    const creatorId = req.user._id || req.user.sub;
    return this.promoCodeService.getCreatorPromoCodes(creatorId.toString());
  }

  @Get('code/:code')
  @ApiOperation({ summary: 'Get a specific promo code by code' })
  @ApiParam({ name: 'code', description: 'Promo code', example: 'SUMMER25' })
  @ApiResponse({ status: 200, type: PromoCodeResponseDto })
  @ApiResponse({ status: 404, description: 'Promo code not found' })
  async getByCode(@Param('code') code: string): Promise<PromoCodeResponseDto> {
    return this.promoCodeService.findByCode(code);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific promo code by ID' })
  @ApiParam({ name: 'id', description: 'Promo code ID' })
  @ApiResponse({ status: 200, type: PromoCodeResponseDto })
  @ApiResponse({ status: 404, description: 'Promo code not found' })
  async getById(@Param('id') id: string): Promise<PromoCodeResponseDto> {
    return this.promoCodeService.findById(id);
  }

  @Put('code/:code')
  @ApiOperation({ summary: 'Update a promo code' })
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
  @ApiOperation({ summary: 'Delete a promo code' })
  @ApiParam({ name: 'code', description: 'Promo code', example: 'SUMMER25' })
  @ApiResponse({ status: 200, description: 'Promo code deleted successfully' })
  @ApiResponse({ status: 404, description: 'Promo code not found' })
  async delete(@Param('code') code: string): Promise<{ message: string }> {
    return this.promoCodeService.delete(code);
  }

  @Get('code/:code/stats')
  @ApiOperation({ summary: 'Get usage statistics for a promo code' })
  @ApiParam({ name: 'code', description: 'Promo code', example: 'SUMMER25' })
  @ApiResponse({ status: 200, type: PromoCodeStatsDto })
  @ApiResponse({ status: 404, description: 'Promo code not found' })
  async getStats(@Param('code') code: string): Promise<PromoCodeStatsDto> {
    return this.promoCodeService.getStats(code);
  }

  @Get('code/:code/usage')
  @ApiOperation({ summary: 'Get all users who used a specific promo code' })
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
}
