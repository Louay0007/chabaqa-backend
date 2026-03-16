import {
  Controller, Get, Post, Body, Query, Req, UseGuards, Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AffiliateService } from './affiliate.service';
import { AffiliatePayoutService } from './affiliate-payout.service';
import { CreatePartnerLinkDto, RequestPayoutDto, StatsQueryDto } from './dto/affiliate.dto';

@ApiTags('Affiliate – Partner Portal')
@Controller('affiliate/me')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AffiliatePartnerController {
  private readonly logger = new Logger(AffiliatePartnerController.name);

  constructor(
    private readonly affiliateService: AffiliateService,
    private readonly payoutService: AffiliatePayoutService,
  ) {}

  private getUserId(req: any): string {
    return (req.user?._id || req.user?.sub || '').toString();
  }

  @Get('programs')
  @ApiOperation({ summary: 'List programs where you are an approved partner' })
  async getPrograms(@Req() req: any) {
    return this.affiliateService.getPartnerPrograms(this.getUserId(req));
  }

  @Get('links')
  @ApiOperation({ summary: 'List your affiliate links' })
  async getLinks(@Req() req: any) {
    return this.affiliateService.getPartnerLinks(this.getUserId(req));
  }

  @Post('links')
  @ApiOperation({ summary: 'Generate a share link for a program target' })
  async createLink(@Req() req: any, @Body() dto: CreatePartnerLinkDto) {
    return this.affiliateService.createPartnerLink(this.getUserId(req), dto);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Your affiliate stats (clicks, conversions by status)' })
  async getStats(@Req() req: any, @Query() query: StatsQueryDto) {
    return this.affiliateService.getPartnerStats(this.getUserId(req), query.from, query.to);
  }

  @Get('balance')
  @ApiOperation({ summary: 'Your commission balance breakdown' })
  async getBalance(@Req() req: any) {
    return this.payoutService.getBalance(this.getUserId(req));
  }

  @Post('payouts')
  @ApiOperation({ summary: 'Request a payout' })
  async requestPayout(@Req() req: any, @Body() dto: RequestPayoutDto) {
    return this.payoutService.requestPayout(
      this.getUserId(req),
      dto.amountDT,
      dto.method,
      dto.metadata,
    );
  }

  @Get('payouts')
  @ApiOperation({ summary: 'List your payout requests' })
  async getPayouts(@Req() req: any) {
    return this.payoutService.getPartnerPayouts(this.getUserId(req));
  }
}
