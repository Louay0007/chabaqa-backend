import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WalletService } from './wallet.service';
import { TopUpCurrency } from '../schema/topup-request.schema';
import { WalletTransactionType, WalletPurchaseContentType } from '../schema/wallet-transaction.schema';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { UploadService } from '../upload/upload.service';
import { MediaPurpose } from '../media/media.types';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly uploadService: UploadService,
  ) {}

  /**
   * Helper to get user ID from request (handles different JWT payload structures)
   */
  private getUserId(req: any): string {
    return req.user._id || req.user.sub || req.user.id;
  }

  /**
   * Check if FREE_MODE is enabled
   */
  @Get('free-mode-check')
  async checkFreeMode() {
    const freeMode = process.env.FREE_MODE === 'true';
    return {
      freeMode,
      message: freeMode ? 'FREE MODE enabled - all content is free' : 'Payment required for paid content'
    };
  }

  /**
   * Get current exchange rates
   */
  @Get('exchange-rates')
  async getExchangeRates() {
    const rates = await this.walletService.getExchangeRates();
    return {
      success: true,
      data: {
        rates,
        baseCurrency: 'DT',
        note: '1 point = 1 DT',
      },
    };
  }

  /**
   * Get user's wallet balance
   */
  @Get('balance')
  async getBalance(@Request() req) {
    const balance = await this.walletService.getWalletBalance(this.getUserId(req));
    return {
      success: true,
      data: balance,
    };
  }

  /**
   * Get wallet summary (balance, stats, recent transactions)
   */
  @Get('summary')
  async getWalletSummary(@Request() req) {
    const summary = await this.walletService.getWalletSummary(this.getUserId(req));
    return {
      success: true,
      data: summary,
    };
  }

  /**
   * Get transaction history
   */
  @Get('transactions')
  async getTransactions(
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
  ) {
    const result = await this.walletService.getTransactionHistory(this.getUserId(req), {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      type: type as WalletTransactionType | undefined,
    });
    return {
      success: true,
      data: result.items,
      meta: result.meta,
    };
  }

  /**
   * Create a top-up request
   */
  @Post('topup')
  @UseInterceptors(
    FileInterceptor('proof', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const extension = extname(file.originalname).toLowerCase();
          const folder = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(extension)
            ? join(process.cwd(), 'uploads/image')
            : join(process.cwd(), 'uploads/document');
          cb(null, folder);
        },
        filename: (req, file, cb) => {
          const extension = extname(file.originalname);
          const uniqueName = `${Date.now()}-${uuidv4()}${extension}`;
          cb(null, uniqueName);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|pdf)$/)) {
          return cb(new BadRequestException('Only image and PDF files are allowed'), false);
        }
        cb(null, true);
      },
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
    }),
  )
  async createTopUpRequest(
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
    @Body('amount') amount: string,
    @Body('currency') currency: string,
    @Body('notes') notes?: string,
  ) {
    console.log('🔍 [TOPUP] req.user:', JSON.stringify(req.user));
    
    if (!file) {
      throw new BadRequestException('Payment proof is required');
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      throw new BadRequestException('Invalid amount');
    }

    if (!Object.values(TopUpCurrency).includes(currency as TopUpCurrency)) {
      throw new BadRequestException('Invalid currency. Use DT, USD, or EUR');
    }

    // Get user ID from either _id or sub (depending on JWT payload structure)
    const userId = this.getUserId(req);
    console.log('🔍 [TOPUP] Using userId:', userId);

    const uploadResult = await this.uploadService.processUploadedFile(file, file.filename, {
      userId,
      purpose: MediaPurpose.WALLET_TOPUP_PROOF,
      entityType: 'wallet_topup',
    });
    const proofUrl = uploadResult.url;

    const topUpRequest = await this.walletService.createTopUpRequest(
      userId,
      amountNum,
      currency as TopUpCurrency,
      proofUrl,
      notes,
    );

    return {
      success: true,
      message: 'Top-up request submitted successfully. Waiting for admin approval.',
      data: topUpRequest,
    };
  }

  /**
   * Get user's top-up requests
   */
  @Get('topup/history')
  async getTopUpHistory(
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    const result = await this.walletService.getUserTopUpRequests(this.getUserId(req), {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      status: status as any,
    });
    return {
      success: true,
      data: result.items,
      meta: result.meta,
    };
  }

  /**
   * Check if user has sufficient balance for a purchase
   */
  @Get('check-balance/:amount')
  async checkBalance(@Request() req, @Param('amount') amount: string) {
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum < 0) {
      throw new BadRequestException('Invalid amount');
    }

    const userId = this.getUserId(req);
    const hasSufficient = await this.walletService.hasSufficientBalance(userId, amountNum);
    const balance = await this.walletService.getWalletBalance(userId);

    return {
      success: true,
      data: {
        hasSufficientBalance: hasSufficient,
        currentBalance: balance.balance,
        requiredAmount: amountNum,
        shortfall: hasSufficient ? 0 : amountNum - balance.balance,
      },
    };
  }

  /**
   * Purchase content with wallet
   */
  @Post('purchase')
  async purchaseWithWallet(
    @Request() req,
    @Body('contentType') contentType: string,
    @Body('contentId') contentId: string,
    @Body('amount') amount: number,
    @Body('creatorId') creatorId: string,
    @Body('description') description?: string,
  ) {
    console.log('🔍 [PURCHASE] Request body:', req.body);
    console.log('🔍 [PURCHASE] Parsed params:', { contentType, contentId, amount, creatorId, description });
    console.log('🔍 [PURCHASE] User:', this.getUserId(req));

    if (!contentType || !contentId || !amount || !creatorId) {
      const missing: string[] = [];
      if (!contentType) missing.push('contentType');
      if (!contentId) missing.push('contentId');
      if (!amount) missing.push('amount');
      if (!creatorId) missing.push('creatorId');
      
      console.error('❌ [PURCHASE] Missing required fields:', missing);
      throw new BadRequestException(`Missing required fields: ${missing.join(', ')}`);
    }

    // Validate contentType
    const validContentTypes = Object.values(WalletPurchaseContentType);
    if (!validContentTypes.includes(contentType as WalletPurchaseContentType)) {
      console.error('❌ [PURCHASE] Invalid contentType:', contentType, 'Valid types:', validContentTypes);
      throw new BadRequestException(`Invalid contentType. Must be one of: ${validContentTypes.join(', ')}`);
    }

    // Validate amount
    if (typeof amount !== 'number' || amount <= 0) {
      console.error('❌ [PURCHASE] Invalid amount:', amount);
      throw new BadRequestException('Amount must be a positive number');
    }

    const result = await this.walletService.purchaseWithWallet(
      this.getUserId(req),
      contentType as WalletPurchaseContentType,
      contentId,
      amount,
      creatorId,
      description,
    );

    return {
      success: true,
      message: 'Purchase successful',
      data: {
        transaction: result.transaction,
        newBalance: result.newBalance,
      },
    };
  }
}
