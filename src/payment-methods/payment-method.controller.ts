import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Body,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaymentMethodService } from './payment-method.service';

@ApiTags('Payment Methods')
@Controller('payment-methods')
export class PaymentMethodController {
  constructor(
    private readonly pmService: PaymentMethodService,
    private readonly configService: ConfigService,
  ) {}

  /** Returns the Stripe publishable key — safe to expose to frontend */
  @Get('config')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get Stripe publishable key for frontend' })
  getConfig() {
    return {
      publishableKey: this.configService.get<string>('STRIPE_PUBLISHABLE_KEY') || '',
    };
  }

  @Post('setup-intent')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create a Stripe SetupIntent for adding a card' })
  @ApiResponse({ status: 201, description: 'SetupIntent created' })
  async createSetupIntent(@Request() req: any) {
    const creatorId = req.user._id || req.user.sub;
    return this.pmService.createSetupIntent(creatorId);
  }

  @Post('confirm')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Confirm and save a payment method after SetupIntent succeeds' })
  @ApiResponse({ status: 201, description: 'Payment method saved' })
  async confirmPaymentMethod(
    @Request() req: any,
    @Body('setupIntentId') setupIntentId: string,
  ) {
    const creatorId = req.user._id || req.user.sub;
    return this.pmService.confirmPaymentMethod(creatorId, setupIntentId);
  }

  /** Create a Stripe Checkout Session in setup mode (redirect, no publishable key needed) */
  @Post('setup-session')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create Stripe Checkout setup session (redirect-based card save)' })
  async createSetupSession(
    @Request() req: any,
    @Body('successUrl') successUrl: string,
    @Body('cancelUrl') cancelUrl: string,
  ) {
    const creatorId = req.user._id || req.user.sub;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return this.pmService.createSetupSession(
      creatorId,
      successUrl || `${frontendUrl}/en/creator/plan/billing/add-card?setup=success`,
      cancelUrl || `${frontendUrl}/en/creator/plan/billing/add-card`,
    );
  }

  /** Called from success redirect — finalizes the saved card */
  @Post('setup-session/complete')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Finalize card save after Checkout setup session' })
  async completeSetupSession(@Body('sessionId') sessionId: string) {
    return this.pmService.handleSetupSessionComplete(sessionId);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'List saved payment methods' })
  @ApiResponse({ status: 200, description: 'List of payment methods' })
  async listPaymentMethods(@Request() req: any) {
    const creatorId = req.user._id || req.user.sub;
    return this.pmService.listPaymentMethods(creatorId);
  }

  @Patch(':id/set-default')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Set a payment method as default' })
  @ApiResponse({ status: 200, description: 'Default updated' })
  async setDefault(@Request() req: any, @Param('id') pmId: string) {
    const creatorId = req.user._id || req.user.sub;
    return this.pmService.setDefault(creatorId, pmId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Remove a saved payment method' })
  @ApiResponse({ status: 200, description: 'Payment method removed' })
  async remove(@Request() req: any, @Param('id') pmId: string) {
    const creatorId = req.user._id || req.user.sub;
    return this.pmService.remove(creatorId, pmId);
  }
}
