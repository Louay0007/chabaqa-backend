import {
  Controller, Get, Post, Param, Query, Body, UseGuards, Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AffiliatePayoutService } from './affiliate-payout.service';
import { AdminPayoutActionDto } from './dto/affiliate.dto';

@ApiTags('Admin – Affiliate')
@Controller('admin/affiliate')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class AffiliateAdminController {
  private readonly logger = new Logger(AffiliateAdminController.name);

  constructor(private readonly payoutService: AffiliatePayoutService) {}

  @Get('payouts')
  @ApiOperation({ summary: 'List all affiliate payout requests' })
  async getPayouts(@Query('status') status?: string) {
    return this.payoutService.getPayouts(status);
  }

  @Post('payouts/:id/approve')
  @ApiOperation({ summary: 'Approve a payout request' })
  async approvePayout(@Param('id') id: string, @Body() dto: AdminPayoutActionDto) {
    return this.payoutService.approvePayout(id, dto.adminNotes);
  }

  @Post('payouts/:id/mark-paid')
  @ApiOperation({ summary: 'Mark a payout as paid (manual transfer done)' })
  async markPaid(@Param('id') id: string, @Body() dto: AdminPayoutActionDto) {
    return this.payoutService.markPayoutPaid(id, dto.adminNotes);
  }
}
