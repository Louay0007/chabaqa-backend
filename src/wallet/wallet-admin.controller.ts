import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WalletService } from './wallet.service';

@Controller('admin/wallet')
@UseGuards(JwtAuthGuard)
export class WalletAdminController {
  constructor(private readonly walletService: WalletService) {}

  /**
   * Helper to get user ID from request
   */
  private getUserId(req: any): string {
    return req.user._id || req.user.sub || req.user.id;
  }

  /**
   * Get all pending top-up requests (Admin only)
   */
  @Get('topup/pending')
  async getPendingTopUps(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.walletService.getPendingTopUpRequests({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });

    return {
      success: true,
      data: result.items,
      meta: result.meta,
    };
  }

  /**
   * Approve a top-up request (Admin only)
   */
  @Post('topup/:requestId/approve')
  async approveTopUp(
    @Request() req,
    @Param('requestId') requestId: string,
    @Body('notes') notes?: string,
  ) {
    const result = await this.walletService.processTopUpRequest(
      requestId,
      this.getUserId(req),
      'approve',
      notes,
    );

    return {
      success: true,
      message: 'Top-up request approved successfully',
      data: result,
    };
  }

  /**
   * Reject a top-up request (Admin only)
   */
  @Post('topup/:requestId/reject')
  async rejectTopUp(
    @Request() req,
    @Param('requestId') requestId: string,
    @Body('notes') notes?: string,
  ) {
    if (!notes) {
      throw new BadRequestException('Please provide a reason for rejection');
    }

    const result = await this.walletService.processTopUpRequest(
      requestId,
      this.getUserId(req),
      'reject',
      notes,
    );

    return {
      success: true,
      message: 'Top-up request rejected',
      data: result,
    };
  }
}
