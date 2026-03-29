import { Controller, Post, UseGuards, Request, Body, Get, Query, Put, Delete, Param, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiBody, ApiQuery, ApiResponse, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscriptionService } from './subscription.service';
import { PlanTier } from '../schema/plan.schema';
import { 
  CreateSubscriptionDto, 
  UpdateSubscriptionDto, 
  GetSubscriptionsQueryDto, 
  SubscriptionResponseDto, 
  SubscriptionStatsDto, 
  SubscriptionPlanDto,
  WebhookEventDto,
  WebhookResponseDto,
  InvoiceDto,
  InvoiceListDto,
  CreateInvoiceDto,
  UsageSummaryDto,
  RecordUsageDto
} from '../dto-subscription/index';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';

@ApiTags('Subscriptions')
@Controller('subscriptions')
export class SubscriptionController {
  private readonly logger = new Logger(SubscriptionController.name);

  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Post('start-trial')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Start 7-day trial on STARTER plan for current creator' })
  async startTrial(@Request() req: any) {
    const creatorId = req.user._id || req.user.sub;
    return this.subscriptionService.startTrialForCreator(creatorId);
  }

  @Post('setup-billing')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Setup billing method for current creator (store provider customer + masked info)' })
  @ApiBody({ 
    schema: { 
      type: 'object', 
      properties: { 
        providerCustomerId: { type: 'string', description: 'Provider customer ID (required)' }, 
        paymentBrand: { type: 'string', description: 'Payment method brand (visa, mastercard, etc.)', enum: ['visa', 'mastercard', 'amex', 'discover', 'diners', 'jcb', 'unionpay'] }, 
        paymentLast4: { type: 'string', description: 'Last 4 digits of payment method', pattern: '^\\d{4}$' },
        provider: { type: 'string', description: 'Payment provider', enum: ['stripe', 'paypal', 'custom'], default: 'custom' }
      }, 
      required: ['providerCustomerId'] 
    } 
  })
  @ApiResponse({ status: 200, description: 'Billing method setup successfully' })
  @ApiResponse({ status: 400, description: 'Invalid billing information' })
  async setupBilling(@Request() req: any, @Body() body: any) {
    const creatorId = req.user._id || req.user.sub;
    return this.subscriptionService.setupBillingMethod(creatorId, body);
  }

  @Post('upgrade')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Upgrade plan tier (manual/stubbed until provider is integrated)' })
  @ApiBody({ schema: { type: 'object', properties: { tier: { type: 'string', enum: Object.values(PlanTier) } }, required: ['tier'] } })
  async upgrade(@Request() req: any, @Body('tier') tier: string) {
    const creatorId = req.user._id || req.user.sub;
    return this.subscriptionService.upgradePlan(creatorId, tier as PlanTier);
  }

  @Post('cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Cancel at period end' })
  async cancel(@Request() req: any) {
    const creatorId = req.user._id || req.user.sub;
    return this.subscriptionService.cancelAtPeriodEnd(creatorId);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get my subscription' })
  async me(@Request() req: any) {
    const creatorId = req.user._id || req.user.sub;
    return this.subscriptionService.getMySubscription(creatorId);
  }

  @Get('trial-remaining')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get remaining time for current creator\'s trial (days/hours/minutes/seconds)' })
  async trialRemaining(@Request() req: any) {
    const creatorId = req.user._id || req.user.sub;
    return this.subscriptionService.getTrialRemaining(creatorId);
  }

  // New endpoints for comprehensive subscription management

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get subscription statistics for the current creator' })
  @ApiResponse({ status: 200, type: SubscriptionStatsDto })
  async getSubscriptionStats(@Request() req: any): Promise<SubscriptionStatsDto> {
    const creatorId = req.user._id || req.user.sub;
    return this.subscriptionService.getSubscriptionStats(creatorId);
  }

  @Get('all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get all subscriptions with pagination and filtering' })
  @ApiQuery({ name: 'status', required: false, enum: ['trialing', 'active', 'past_due', 'canceled', 'incomplete'] })
  @ApiQuery({ name: 'plan', required: false, enum: Object.values(PlanTier) })
  @ApiQuery({ name: 'startDate', required: false, type: 'string', format: 'date' })
  @ApiQuery({ name: 'endDate', required: false, type: 'string', format: 'date' })
  @ApiQuery({ name: 'page', required: false, type: 'number', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: 'number', example: 20 })
  async getAllSubscriptions(
    @Request() req: any,
    @Query() query: GetSubscriptionsQueryDto
  ): Promise<PaginatedResponseDto<SubscriptionResponseDto>> {
    const creatorId = req.user._id || req.user.sub;
    return this.subscriptionService.getAllSubscriptions(creatorId, query);
  }

  @Post('plans')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create a new subscription plan' })
  @ApiBody({ type: CreateSubscriptionDto })
  @ApiResponse({ status: 201, type: SubscriptionPlanDto })
  async createPlan(@Body() createPlanDto: CreateSubscriptionDto): Promise<SubscriptionPlanDto> {
    return this.subscriptionService.createPlan(createPlanDto);
  }

  @Get('plans')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get all available subscription plans' })
  @ApiResponse({ status: 200, type: [SubscriptionPlanDto] })
  async getPlans(): Promise<SubscriptionPlanDto[]> {
    return this.subscriptionService.getPlans();
  }

  @Get('plans/:tier')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get a specific subscription plan by tier' })
  @ApiResponse({ status: 200, type: SubscriptionPlanDto })
  async getPlanByTier(@Param('tier') tier: string): Promise<SubscriptionPlanDto> {
    return this.subscriptionService.getPlanByTier(tier as PlanTier);
  }

  @Put('plans/:tier')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update a subscription plan' })
  @ApiBody({ type: UpdateSubscriptionDto })
  @ApiResponse({ status: 200, type: SubscriptionPlanDto })
  async updatePlan(
    @Param('tier') tier: string,
    @Body() updatePlanDto: UpdateSubscriptionDto
  ): Promise<SubscriptionPlanDto> {
    return this.subscriptionService.updatePlan(tier as PlanTier, updatePlanDto);
  }

  @Delete('plans/:tier')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete a subscription plan' })
  @ApiResponse({ status: 200, description: 'Plan deleted successfully' })
  async deletePlan(@Param('tier') tier: string): Promise<{ message: string }> {
    return this.subscriptionService.deletePlan(tier as PlanTier);
  }

  @Post('export')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Export subscriptions data to CSV' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['trialing', 'active', 'past_due', 'canceled', 'incomplete'] },
        plan: { type: 'string', enum: Object.values(PlanTier) },
        startDate: { type: 'string', format: 'date' },
        endDate: { type: 'string', format: 'date' }
      }
    }
  })
  async exportSubscriptions(
    @Request() req: any,
    @Body() filters?: { status?: string; plan?: PlanTier; startDate?: string; endDate?: string }
  ): Promise<{ message: string; downloadUrl: string }> {
    const creatorId = req.user._id || req.user.sub;
    return this.subscriptionService.exportSubscriptions(creatorId, filters);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update a subscription' })
  @ApiBody({ type: UpdateSubscriptionDto })
  @ApiResponse({ status: 200, type: SubscriptionResponseDto })
  async updateSubscription(
    @Param('id') subscriptionId: string,
    @Body() updateDto: UpdateSubscriptionDto
  ): Promise<SubscriptionResponseDto> {
    return this.subscriptionService.updateSubscription(subscriptionId, updateDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete a canceled subscription' })
  @ApiParam({ name: 'id', description: 'Subscription ID' })
  @ApiResponse({ status: 200, description: 'Subscription deleted successfully' })
  @ApiResponse({ status: 400, description: 'Cannot delete active subscription' })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  async deleteSubscription(@Param('id') subscriptionId: string): Promise<{ message: string }> {
    return this.subscriptionService.deleteSubscription(subscriptionId);
  }

  // ============ WEBHOOK ENDPOINTS ============

  @Post('webhook')
  @HttpCode(HttpStatus.GONE)
  @ApiOperation({ summary: 'Deprecated unsigned webhook endpoint' })
  @ApiBody({ type: WebhookEventDto })
  @ApiResponse({ status: 200, type: WebhookResponseDto })
  async handleWebhook(@Body() webhookEvent: WebhookEventDto): Promise<WebhookResponseDto> {
    this.logger.warn(
      `Rejected unsigned subscription webhook attempt for event ${webhookEvent?.id || 'unknown'}`,
    );
    return {
      message: 'Unsigned webhook payloads are no longer accepted. Use a provider-specific signed webhook endpoint.',
      eventId: webhookEvent?.id || 'unknown',
      status: 'skipped',
    };
  }

  // ============ INVOICE ENDPOINTS ============

  @Get('invoices')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get invoices for current creator' })
  @ApiQuery({ name: 'page', required: false, type: 'number', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: 'number', example: 20 })
  @ApiResponse({ status: 200, type: InvoiceListDto })
  async getInvoices(
    @Request() req: any,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20
  ): Promise<InvoiceListDto> {
    const creatorId = req.user._id || req.user.sub;
    return this.subscriptionService.getInvoices(creatorId, page, limit);
  }

  @Get('invoices/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get a specific invoice by ID' })
  @ApiParam({ name: 'id', description: 'Invoice ID' })
  @ApiResponse({ status: 200, type: InvoiceDto })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async getInvoiceById(@Param('id') invoiceId: string): Promise<InvoiceDto> {
    return this.subscriptionService.getInvoiceById(invoiceId);
  }

  @Post('invoices')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create a new invoice' })
  @ApiBody({ type: CreateInvoiceDto })
  @ApiResponse({ status: 201, type: InvoiceDto })
  async createInvoice(@Body() createInvoiceDto: CreateInvoiceDto): Promise<InvoiceDto> {
    return this.subscriptionService.createInvoice(createInvoiceDto);
  }

  // ============ USAGE TRACKING ENDPOINTS ============

  @Post('usage')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Record usage for current creator' })
  @ApiBody({ type: RecordUsageDto })
  @ApiResponse({ status: 200, description: 'Usage recorded successfully' })
  async recordUsage(
    @Request() req: any,
    @Body() recordUsageDto: RecordUsageDto
  ): Promise<{ message: string }> {
    const creatorId = req.user._id || req.user.sub;
    return this.subscriptionService.recordUsage(creatorId, recordUsageDto);
  }

  @Get('usage')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get usage summary for current creator' })
  @ApiQuery({ name: 'startDate', required: false, type: 'string', format: 'date' })
  @ApiQuery({ name: 'endDate', required: false, type: 'string', format: 'date' })
  @ApiResponse({ status: 200, type: UsageSummaryDto })
  async getUsageSummary(
    @Request() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ): Promise<UsageSummaryDto> {
    const creatorId = req.user._id || req.user.sub;
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.subscriptionService.getUsageSummary(creatorId, start, end);
  }
}


