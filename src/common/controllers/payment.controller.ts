import { Controller, Post, Body, Query, Get, BadRequestException, UnauthorizedException, ForbiddenException, InternalServerErrorException, Req, UseGuards, UseInterceptors, UploadedFile, Param, Logger } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as crypto from 'crypto';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FlouciPaymentService } from '../services/flouci-payment.service';
import { StripePaymentService } from '../services/stripe-payment.service';
import { KonnectPaymentService } from '../services/konnect-payment.service';
import { ManualPaymentService } from '../services/manual-payment.service';
import { PaymentFulfillmentService } from '../services/payment-fulfillment.service';
import { PaymentAuditService } from '../services/payment-audit.service';
import { UploadService } from '../../upload/upload.service';
import { Community, CommunityDocument } from '../../schema/community.schema';
import { User, UserDocument } from '../../schema/user.schema';
import { Order, OrderDocument } from '../../schema/order.schema';
import { PromoService } from '../services/promo.service';
import { FeeService } from '../services/fee.service';
import { TrackableContentType } from '../../schema/content-tracking.schema';
import { Cours, CoursDocument } from '../../schema/course.schema';
import { Challenge, ChallengeDocument } from '../../schema/challenge.schema';
import { Event, EventDocument } from '../../schema/event.schema';
import { Product, ProductDocument } from '../../schema/product.schema';
import { Session, SessionDocument } from '../../schema/session.schema';
import { CoursService } from '../../cours/cours.service';
import { ChallengeService } from '../../challenge/challenge.service';
import { EventService } from '../../event/event.service';
import { SubscriptionService } from '../../subscription/subscription.service';
import { SessionService } from '../../session/session.service';
import { Plan, PlanDocument, PlanTier } from '../../schema/plan.schema';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { NotificationService } from '../../notification/notification.service';
import { EmailService } from '../services/email.service';
import { MediaPurpose } from '../../media/media.types';
import {
  ProcessedWebhookEvent,
  ProcessedWebhookEventDocument,
} from '../../schema/processed-webhook-event.schema';
import { AffiliateAttributionService } from '../../affiliate/affiliate-attribution.service';
import { AffiliateCommissionService } from '../../affiliate/affiliate-commission.service';

const manualProofStorage = diskStorage({
  destination: (req, file, cb) => {
    const extension = extname(file.originalname || '').toLowerCase();
    let folder = join(process.cwd(), 'uploads', 'document');
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(extension)) {
      folder = join(process.cwd(), 'uploads', 'image');
    } else if (['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm'].includes(extension)) {
      folder = join(process.cwd(), 'uploads', 'video');
    } else if (['.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt'].includes(extension)) {
      folder = join(process.cwd(), 'uploads', 'document');
    } else if (['.mp3', '.wav', '.ogg', '.aac', '.flac'].includes(extension)) {
      folder = join(process.cwd(), 'uploads', 'audio');
    }
    cb(null, folder);
  },
  filename: (req, file, cb) => {
    const extension = extname(file.originalname || '');
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;
    cb(null, uniqueName);
  },
});

@ApiTags('Payments')
@Controller('payment')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);
  private mongoTransactionSupport: boolean | null = null;

  constructor(
    private readonly flouci: FlouciPaymentService,
    private readonly stripe: StripePaymentService,
    private readonly konnect: KonnectPaymentService,
    private readonly promoService: PromoService,
    private readonly feeService: FeeService,
    private readonly manualPaymentService: ManualPaymentService,
    private readonly uploadService: UploadService,
    private readonly paymentFulfillmentService: PaymentFulfillmentService,
    private readonly paymentAuditService: PaymentAuditService,
    private readonly notificationService: NotificationService,
    private readonly emailService: EmailService,
    @InjectModel(Community.name) private communityModel: Model<CommunityDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(Cours.name) private coursModel: Model<CoursDocument>,
    @InjectModel(Challenge.name) private challengeModel: Model<ChallengeDocument>,
    @InjectModel(Event.name) private eventModel: Model<EventDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
    @InjectModel(ProcessedWebhookEvent.name)
    private readonly processedWebhookEventModel: Model<ProcessedWebhookEventDocument>,
    private readonly coursService: CoursService,
    private readonly challengeService: ChallengeService,
    private readonly eventService: EventService,
    private readonly sessionService: SessionService,
    private readonly subscriptionService: SubscriptionService,
    @InjectModel(Plan.name) private planModel: Model<PlanDocument>,
    private readonly affiliateAttributionService: AffiliateAttributionService,
    private readonly affiliateCommissionService: AffiliateCommissionService,
  ) { }

  private isEnvFlagEnabled(name: string, defaultValue = false): boolean {
    const raw = process.env[name];
    if (raw === undefined || raw === null || raw === '') return defaultValue;
    return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
  }

  private normalizePaymentChannel(raw?: string): 'web' | 'mobile' {
    return String(raw || '').toLowerCase() === 'mobile' ? 'mobile' : 'web';
  }

  private getRedirectAllowlistPrefixes(): string[] {
    const envValue = String(process.env.PAYMENTS_REDIRECT_ALLOWLIST || '').trim();
    const parsed = envValue
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    if (parsed.length > 0) {
      return parsed;
    }

    const fallback = String(process.env.FRONTEND_URL || 'https://chabaqa.io').trim();
    return [fallback];
  }

  private resolveCheckoutRedirectUrl(defaultUrl: string, overrideUrl?: string): string {
    const normalizedOverride = typeof overrideUrl === 'string' ? overrideUrl.trim() : '';
    if (!normalizedOverride) {
      return defaultUrl;
    }

    try {
      const parsed = new URL(normalizedOverride);
      const absolute = parsed.toString();
      const allowedPrefixes = this.getRedirectAllowlistPrefixes();
      const isAllowed = allowedPrefixes.some((prefix) => absolute.startsWith(prefix));
      if (!isAllowed) {
        throw new BadRequestException(
          `Redirect URL is not allowed. Allowed prefixes: ${allowedPrefixes.join(', ')}`,
        );
      }
      return absolute;
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Invalid redirect URL');
    }
  }

  private isStripeSessionPlaceholder(value: string): boolean {
    return value.toUpperCase().includes('CHECKOUT_SESSION_ID');
  }

  private normalizeClientContext(raw: any): Record<string, string> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return {};
    }

    const entries = Object.entries(raw as Record<string, any>)
      .filter(([key]) => typeof key === 'string' && key.trim().length > 0)
      .slice(0, 20)
      .map(([key, value]) => [key, String(value ?? '')]);

    return Object.fromEntries(entries);
  }

  private buildStripeInitResponse(params: {
    scope: string;
    targetId: string;
    orderId: string;
    sessionId?: string;
    checkoutUrl?: string;
    extra?: Record<string, any>;
  }) {
    return {
      checkoutUrl: params.checkoutUrl,
      sessionId: params.sessionId,
      orderId: params.orderId,
      provider: 'stripe',
      scope: params.scope,
      targetId: params.targetId,
      ...(params.extra || {}),
    };
  }

  private buildPendingFulfillmentMetadata(base?: Record<string, any>): Record<string, any> {
    return {
      ...(base || {}),
      fulfillmentStatus: 'pending',
      fulfillmentUpdatedAt: new Date().toISOString(),
    };
  }

  private resolveAffiliateAttribution(req: any): Record<string, any> {
    const { clickId } = this.affiliateAttributionService.resolveAttributionFromRequest(req);
    return clickId ? { affiliateClickId: clickId } : {};
  }

  private async hasProcessedWebhookEvent(provider: string, eventId: string): Promise<boolean> {
    if (!eventId) {
      return false;
    }

    const count = await this.processedWebhookEventModel.countDocuments({
      provider,
      eventId,
    });
    return count > 0;
  }

  private async markWebhookEventProcessed(
    provider: string,
    eventId: string,
    eventType: string,
  ): Promise<void> {
    if (!eventId) {
      return;
    }

    await this.processedWebhookEventModel.updateOne(
      { provider, eventId },
      {
        $setOnInsert: {
          provider,
          eventId,
          eventType,
          processedAt: new Date(),
        },
      },
      { upsert: true },
    );
  }

  private async auditPaymentEvent(
    entry: {
      orderId?: string;
      eventType: string;
      provider?: string;
      eventId?: string;
      paymentMethod?: string;
      previousStatus?: string;
      nextStatus?: string;
      reason?: string;
      error?: string;
      metadata?: Record<string, any>;
    },
    session: any = null,
  ): Promise<void> {
    await this.paymentAuditService.log(entry, session);
  }

  private async enrichOrderDetails(order: any) {
    const contentType = order.contentType;
    const contentId = order.contentId;
    let contentTitle = '';
    let communitySlug = '';
    let creatorSlug = '';
    let contentIdRaw = contentId;

    try {
      let communityId = order.communityId;
      let creatorId = order.creatorId;

      // 1. Resolve Content & Links
      if (contentType === TrackableContentType.COURSE) {
        const course = await this.coursModel.findById(contentId).select('titre communityId creatorId id').lean();
        if (course) {
          contentTitle = (course as any).titre;
          communityId = (course as any).communityId;
          creatorId = (course as any).creatorId;
          // Use string ID if available for URL consistency
          contentIdRaw = (course as any).id || (course as any)._id.toString();
        }
      } else if (contentType === 'chapter') { // ADDED: Chapter Support
        // Find course containing this chapter
        // Note: contentId here is chapterId
        const course = await this.coursModel.findOne({ 'sections.chapitres.id': contentId }).select('titre communityId creatorId id sections').lean();
        if (course) {
           // Find chapter details
           let chapterTitle = 'Paid Chapter';
           (course as any).sections.forEach(s => {
             const c = s.chapitres.find(ch => ch.id === contentId);
             if (c) chapterTitle = c.titre;
           });
           
           contentTitle = `${(course as any).titre} - ${chapterTitle}`;
           communityId = (course as any).communityId;
           creatorId = (course as any).creatorId;
           // We might want to link back to the course page
           contentIdRaw = (course as any).id || (course as any)._id.toString();
        }
      } else if (contentType === TrackableContentType.COMMUNITY) {
        communityId = contentId;
        const comm = await this.communityModel.findById(contentId).select('name createur').lean();
        if (comm) {
          contentTitle = (comm as any).name;
          creatorId = (comm as any).createur;
        }
      } else if (contentType === TrackableContentType.CHALLENGE) {
        const challenge = await this.challengeModel.findById(contentId).select('title communityId creatorId').lean();
        if (challenge) {
          contentTitle = (challenge as any).title;
          communityId = (challenge as any).communityId;
          creatorId = (challenge as any).creatorId;
        }
      } else if (contentType === TrackableContentType.EVENT) {
        const event = await this.eventModel.findById(contentId).select('title communityId creatorId').lean();
        if (event) {
          contentTitle = (event as any).title;
          communityId = (event as any).communityId;
          creatorId = (event as any).creatorId;
        }
      } else if (contentType === TrackableContentType.PRODUCT) {
        const product = await this.productModel.findById(contentId).select('name communityId creatorId').lean();
        if (product) {
          contentTitle = (product as any).name;
          communityId = (product as any).communityId;
          creatorId = (product as any).creatorId;
        }
      } else if (contentType === TrackableContentType.SESSION) {
        const session = await this.sessionModel.findById(contentId).select('title communityId creatorId').lean();
        if (session) {
          contentTitle = (session as any).title;
          communityId = (session as any).communityId;
          creatorId = (session as any).creatorId;
        }
      }

      // 2. Fetch Community Slug
      if (communityId) {
        const comm = await this.communityModel.findById(communityId).select('slug').lean();
        if (comm) communitySlug = (comm as any).slug;
      }

      // 3. Fetch Creator Slug
      if (creatorId) {
        const user = await this.userModel.findById(creatorId).select('name').lean();
        if (user && (user as any).name) {
          // Simple slugify: lowercase, replace spaces with dash, remove non-alphanumeric
          creatorSlug = (user as any).name.toString().toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^\w\-]+/g, '');
        }
      }

    } catch (e) {
      this.logger.warn(`Error enriching order details: ${e.message}`);
    }

    return {
      contentTitle,
      communitySlug,
      creatorSlug,
      targetId: contentIdRaw
    };
  }

  private async enrichManualOrdersForDashboard(orders: any[]) {
    const items = await Promise.all(
      (orders || []).map(async (order) => {
        const contentType = (order as any)?.contentType;
        const contentId = (order as any)?.contentId;

        let contentTitle: string | null = null;
        let contentCommunityId: string | null = null;

        try {
          if (contentType === TrackableContentType.COURSE) {
            const course = await this.coursModel.findById(contentId).select('titre communityId').lean();
            contentTitle = (course as any)?.titre || null;
            contentCommunityId = (course as any)?.communityId ? String((course as any)?.communityId) : null;
          } else if (contentType === TrackableContentType.CHALLENGE) {
            const challenge = await this.challengeModel.findById(contentId).select('title titre name communityId').lean();
            contentTitle = (challenge as any)?.title || (challenge as any)?.titre || (challenge as any)?.name || null;
            contentCommunityId = (challenge as any)?.communityId ? String((challenge as any)?.communityId) : null;
          } else if (contentType === TrackableContentType.SESSION) {
            const session = await this.sessionModel.findById(contentId).select('title name communityId').lean();
            contentTitle = (session as any)?.title || (session as any)?.name || null;
            contentCommunityId = (session as any)?.communityId ? String((session as any)?.communityId) : null;
          } else if (contentType === TrackableContentType.PRODUCT) {
            const product = await this.productModel.findById(contentId).select('title name communityId').lean();
            contentTitle = (product as any)?.title || (product as any)?.name || null;
            contentCommunityId = (product as any)?.communityId ? String((product as any)?.communityId) : null;
          } else if (contentType === TrackableContentType.EVENT) {
            const event = await this.eventModel.findById(contentId).select('title name communityId').lean();
            contentTitle = (event as any)?.title || (event as any)?.name || null;
            contentCommunityId = (event as any)?.communityId ? String((event as any)?.communityId) : null;
          } else if (contentType === TrackableContentType.COMMUNITY) {
            const community = await this.communityModel.findById(contentId).select('name slug').lean();
            contentTitle = (community as any)?.name || null;
            contentCommunityId = contentId ? String(contentId) : null;
          }
        } catch {
          // ignore lookup errors; keep best-effort enrichment
        }

        let communityInfo: any = null;
        const communityId = contentCommunityId || (order as any)?.communityId?.toString?.() || (order as any)?.communityId;
        if (communityId) {
          try {
            const comm = await this.communityModel.findById(communityId).select('name slug').lean();
            if (comm) {
              communityInfo = {
                _id: String((comm as any)._id),
                name: (comm as any).name,
                slug: (comm as any).slug,
              };
            }
          } catch {
            communityInfo = null;
          }
        }

        return {
          ...(order?.toObject ? order.toObject() : order),
          contentTitle,
          community: communityInfo,
        };
      }),
    );

    return items;
  }

  private getFrontendBaseUrl(): string {
    const base = (process.env.FRONTEND_URL || 'https://chabaqa.com').trim();
    return base.replace(/\/+$/, '');
  }

  private buildInviteLink(inviteCode: string): string {
    return `${this.getFrontendBaseUrl()}/invite/${encodeURIComponent(inviteCode)}`;
  }

  private normalizeInviteCode(value?: string): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private async generateUniqueInviteCode(): Promise<string> {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let attempt = 0; attempt < 12; attempt++) {
      let code = '';
      for (let i = 0; i < 12; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const exists = await this.communityModel.exists({ inviteCode: code });
      if (!exists) {
        return code;
      }
    }
    throw new InternalServerErrorException('Unable to generate unique invite code');
  }

  private async ensurePrivateInviteData(community: CommunityDocument): Promise<void> {
    if (!community.isPrivate) {
      return;
    }

    let changed = false;
    if (!community.inviteCode) {
      community.inviteCode = await this.generateUniqueInviteCode();
      changed = true;
    }

    const canonicalInviteLink = this.buildInviteLink(community.inviteCode);
    if (community.inviteLink !== canonicalInviteLink) {
      community.inviteLink = canonicalInviteLink;
      changed = true;
    }

    if (changed) {
      await community.save();
    }
  }

  private async assertPrivateInviteAccess(
    community: CommunityDocument,
    inviteCode?: string,
  ): Promise<string | undefined> {
    if (!community.isPrivate) {
      return undefined;
    }

    await this.ensurePrivateInviteData(community);
    const normalizedInviteCode = this.normalizeInviteCode(inviteCode);
    if (!normalizedInviteCode || normalizedInviteCode !== community.inviteCode) {
      throw new ForbiddenException(
        'Cette communauté est privée. Vous devez utiliser un lien d\'invitation valide.',
      );
    }

    return normalizedInviteCode;
  }

  @Post('init/community')
  @ApiOperation({ summary: 'Initiate Flouci payment for community membership' })
  @ApiQuery({ name: 'promoCode', required: false })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async initCommunityPayment(
    @Body('communityId') communityId: string,
    @Body('inviteCode') inviteCode: string | undefined,
    @Req() req: any,
    @Query('promoCode') promoCode?: string,
  ) {
    const userId = (req.user?._id || req.user?.sub || '').toString();
    const community = await this.communityModel.findById(communityId);
    if (!community) throw new BadRequestException('Communauté non trouvée');
    const validatedInviteCode = await this.assertPrivateInviteAccess(community, inviteCode);

    const price = community.fees_of_join || 0;
    if (price <= 0) throw new BadRequestException('Communauté gratuite');

    let amount = price;
    let discountDT = 0;
    let appliedCode: string | undefined;
    if (promoCode) {
      const buyer = await this.userModel.findById(userId).select('email');
      const promo = await this.promoService.validateAndApply(promoCode, price, TrackableContentType.COMMUNITY, community._id.toString(), (buyer as any)?.email);
      if (promo.valid) {
        amount = promo.finalAmountDT;
        discountDT = promo.discountDT;
        appliedCode = promo.appliedCode;
      }
    }

    const breakdown = await this.feeService.calculateForAmount(amount, community.createur.toString());
    const metadata: Record<string, any> = {};
    if (validatedInviteCode) {
      metadata.inviteCode = validatedInviteCode;
    }
    const pendingOrder = await this.orderModel.create({
      buyerId: new Types.ObjectId(userId),
      creatorId: community.createur,
      communityId: community._id,
      contentType: TrackableContentType.COMMUNITY,
      contentId: community._id.toString(),
      amountDT: breakdown.amountDT,
      platformPercent: breakdown.platformPercent,
      platformFixedDT: breakdown.platformFixedDT,
      platformFeeDT: breakdown.platformFeeDT,
      creatorNetDT: breakdown.creatorNetDT,
      promoCode: appliedCode,
      discountDT,
      status: 'pending',
      metadata,
    });

    const successUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-success?scope=community&id=${communityId}`;
    const failUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-failed?scope=community&id=${communityId}`;

    const init = await this.flouci.initPayment({
      amountTND: amount,
      successUrl,
      failUrl,
      metadata: {
        userId,
        contentType: 'community',
        contentId: communityId,
        ...(validatedInviteCode ? { inviteCode: validatedInviteCode } : {}),
      },
    });
    if (!init.success) throw new BadRequestException(init.error);
    pendingOrder.paymentId = init.paymentId;
    await pendingOrder.save();
    return { link: init.link, paymentId: init.paymentId, qrCode: init.qrCode };
  }

  @Get('verify')
  @ApiOperation({ summary: 'Vérifier un paiement Flouci' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async verify(@Query('paymentId') paymentId: string) {
    // Support offline: if paymentId equals an Order _id, use it directly
    let order: any = await this.orderModel.findOne({ paymentId });
    if (!order) {
      const byId = await this.orderModel.findById(paymentId as any);
      order = byId || null;
    }
    if (!order) throw new BadRequestException('Commande non trouvée');
    const verify = await this.flouci.verifyPayment(paymentId);
    if (!verify.success) throw new BadRequestException((verify as any).error);

    if (verify.status === 'SUCCESS') {
      await this.auditPaymentEvent({
        orderId: order._id?.toString?.(),
        eventType: 'provider_verification_completed',
        provider: 'flouci',
        eventId: paymentId,
        paymentMethod: (verify as any).paymentMethod || order.paymentMethod,
        previousStatus: order.status,
        nextStatus: 'paid',
      });
      let didCompleteFulfillment = false;
      await this.runWithOptionalTransaction(async (session) => {
        const claim = await this.paymentFulfillmentService.claimForProcessing(
          order._id.toString(),
          (verify as any).paymentMethod || order.paymentMethod,
          session,
        );
        if (!claim.order) {
          throw new BadRequestException('Commande non trouvée');
        }
        order = claim.order;

        if (claim.state === 'requires_booking' || claim.state === 'completed') {
          return;
        }
        if (claim.state !== 'claimed') {
          return;
        }

        try {
          await this.grantAccess(order, session);
          order = await this.paymentFulfillmentService.markCompleted(order, session);
          didCompleteFulfillment = true;
        } catch (error: any) {
          if (order.contentType === TrackableContentType.SESSION && this.isMissingScheduledAtError(error)) {
            order = await this.paymentFulfillmentService.markRequiresBooking(order, session, {
              contentId: order.metadata?.contentId || order.contentId,
            });
            return;
          }
          await this.paymentFulfillmentService.markFailed(order, error, session);
          throw error;
        }
      });

      if (didCompleteFulfillment) {
        await this.incrementProductSalesFromOrder(order);
        await this.affiliateCommissionService.onOrderPaid(order).catch((e) => this.logger.error(`Affiliate onOrderPaid failed: ${e?.message}`));
      }

      if (order.contentType === TrackableContentType.SESSION && order.metadata?.fulfillmentStatus === 'requires_booking') {
        return {
          status: 'paid_action_required',
          action: 'choose_session_slot',
          message: 'Payment received. Please choose a session slot to finalize your booking.',
          orderId: order._id,
          sessionContentId: order.metadata?.contentId || order.contentId,
          ...(await this.enrichOrderDetails(order)),
        };
      }
      const enriched = await this.enrichOrderDetails(order);
      return { status: 'paid', orderId: order._id, ...enriched };
    }

    order.status = 'pending';
    await order.save();
    return { status: verify.status };
  }

  @Get('order/:orderId')
  @ApiOperation({ summary: 'Get order state (including fulfillment status)' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getOrderState(@Param('orderId') orderId: string, @Req() req: any) {
    const userId = (req.user?._id || req.user?.sub || '').toString();
    if (!Types.ObjectId.isValid(orderId)) {
      throw new BadRequestException('Invalid orderId');
    }

    const order = await this.orderModel.findById(orderId).lean();
    if (!order) {
      throw new BadRequestException('Order not found');
    }

    const isBuyer = String((order as any)?.buyerId || '') === userId;
    const isCreator = String((order as any)?.creatorId || '') === userId;
    if (!isBuyer && !isCreator) {
      throw new ForbiddenException('You are not allowed to view this order');
    }

    const enriched = await this.enrichOrderDetails(order);
    return {
      success: true,
      data: {
        orderId: String((order as any)._id),
        status: (order as any).status,
        paymentMethod: (order as any).paymentMethod,
        paymentId: (order as any).paymentId,
        contentType: (order as any).contentType,
        contentId: (order as any).contentId,
        amountDT: (order as any).amountDT,
        metadata: (order as any).metadata || {},
        ...enriched,
      },
    };
  }

  @Post('init/subscription')
  @ApiOperation({ summary: 'Initier un paiement Flouci pour une souscription' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async initSubscription(
    @Req() req: any,
    @Body('tier') tier: string
  ) {
    const userId = (req.user?._id || req.user?.sub || '').toString();
    const plan = await this.planModel.findOne({ tier, isActive: true });
    if (!plan) throw new BadRequestException('Plan introuvable');
    const amount = (plan as any).priceMonthlyDT || (plan as any).priceDT || 0;
    if (amount <= 0) throw new BadRequestException('Montant invalide');

    const breakdown = await this.feeService.calculateForAmount(amount, userId);
    const pendingOrder = await this.orderModel.create({
      buyerId: new Types.ObjectId(userId),
      creatorId: new Types.ObjectId(userId),
      contentType: TrackableContentType.SUBSCRIPTION,
      contentId: tier,
      amountDT: breakdown.amountDT,
      platformPercent: breakdown.platformPercent,
      platformFixedDT: breakdown.platformFixedDT,
      platformFeeDT: breakdown.platformFeeDT,
      creatorNetDT: breakdown.creatorNetDT,
      status: 'pending',
    });

    const successUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-success?scope=subscription&tier=${tier}`;
    const failUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-failed?scope=subscription&tier=${tier}`;
    const init = await this.flouci.initPayment({ amountTND: amount, successUrl, failUrl, metadata: { userId, contentType: 'subscription', tier } });
    if (!init.success) throw new BadRequestException(init.error);
    pendingOrder.paymentId = init.paymentId; await pendingOrder.save();
    return { link: init.link, paymentId: init.paymentId, qrCode: init.qrCode };
  }

  @Post('webhook')
  @ApiOperation({ summary: 'Webhook Flouci (server-to-server reconciliation)' })
  async webhook(@Req() req: any) {
    const body = req.body || {};
    const paymentId: string = body.payment_id;
    if (!paymentId) throw new BadRequestException('payment_id requis');

    const configuredSecret = process.env.FLOUCI_WEBHOOK_SECRET;
    const incomingSig = req.headers['x-flouci-signature'] as string | undefined;

    if (configuredSecret) {
      if (!incomingSig) throw new UnauthorizedException('Signature manquante');
      const computed = crypto
        .createHmac('sha256', configuredSecret)
        .update(JSON.stringify(body))
        .digest('hex');
      const equal = crypto.timingSafeEqual(Buffer.from(incomingSig), Buffer.from(computed));
      if (!equal) throw new UnauthorizedException('Signature invalide');
    }

    return this.verify(paymentId);
  }

  @Post('init/course')
  @ApiOperation({ summary: 'Initier un paiement Flouci pour un cours' })
  @ApiQuery({ name: 'promoCode', required: false })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async initCourse(
    @Body('courseId') courseId: string,
    @Req() req: any,
    @Query('promoCode') promoCode?: string,
  ) {
    const userId = (req.user?._id || req.user?.sub || '').toString();
    const offlineMode = (process.env.PAYMENT_MODE || 'instant') === 'offline';
    let cours: CoursDocument | null = null;
    if (Types.ObjectId.isValid(courseId)) {
      cours = await this.coursModel.findById(courseId);
    }
    if (!cours) {
      cours = await this.coursModel.findOne({ id: courseId });
    }
    if (!cours) throw new BadRequestException('Cours non trouvé');
    const courseObjectId = cours._id;
    const coursePublicId = cours.id || courseObjectId.toString();
    const price = cours.prix || 0;
    if (price <= 0) throw new BadRequestException('Cours gratuit');

    let amount = price;
    let discountDT = 0; let appliedCode: string | undefined;
    if (promoCode) {
      const buyer = await this.userModel.findById(userId).select('email');
      const promo = await this.promoService.validateAndApply(promoCode, price, TrackableContentType.COURSE, cours._id.toString(), (buyer as any)?.email);
      if (promo.valid) { amount = promo.finalAmountDT; discountDT = promo.discountDT; appliedCode = promo.appliedCode; }
    }

    const breakdown = await this.feeService.calculateForAmount(amount, cours.creatorId.toString());
    const pendingOrder = await this.orderModel.create({
      buyerId: new Types.ObjectId(userId),
      creatorId: cours.creatorId,
      contentType: TrackableContentType.COURSE,
      contentId: courseObjectId.toString(),
      amountDT: breakdown.amountDT,
      platformPercent: breakdown.platformPercent,
      platformFixedDT: breakdown.platformFixedDT,
      platformFeeDT: breakdown.platformFeeDT,
      creatorNetDT: breakdown.creatorNetDT,
      promoCode: appliedCode,
      discountDT,
      status: 'pending',
    });

    const successUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-success?scope=course&id=${coursePublicId}`;
    const failUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-failed?scope=course&id=${coursePublicId}`;
    const init = await this.flouci.initPayment({ amountTND: amount, successUrl, failUrl, metadata: { userId, contentType: 'course', contentId: courseId } });
    if (!init.success) throw new BadRequestException(init.error);
    pendingOrder.paymentId = init.paymentId;
    await pendingOrder.save();
    return { link: init.link, paymentId: init.paymentId, qrCode: init.qrCode };
  }

  @Post('init/challenge')
  @ApiOperation({ summary: 'Initier un paiement Flouci pour un défi' })
  @ApiQuery({ name: 'promoCode', required: false })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async initChallenge(
    @Body('challengeId') challengeId: string,
    @Req() req: any,
    @Query('promoCode') promoCode?: string,
  ) {
    const userId = (req.user?._id || req.user?.sub || '').toString();
    const offlineMode = (process.env.PAYMENT_MODE || 'instant') === 'offline';
    const challenge = await this.challengeModel.findById(challengeId);
    if (!challenge) throw new BadRequestException('Défi non trouvé');
    const price = challenge.pricing?.participationFee || 0;
    if (price <= 0) throw new BadRequestException('Défi gratuit');

    let amount = price; let discountDT = 0; let appliedCode: string | undefined;
    if (promoCode) {
      const buyer = await this.userModel.findById(userId).select('email');
      const promo = await this.promoService.validateAndApply(promoCode, price, TrackableContentType.CHALLENGE, challenge._id.toString(), (buyer as any)?.email);
      if (promo.valid) { amount = promo.finalAmountDT; discountDT = promo.discountDT; appliedCode = promo.appliedCode; }
    }
    const breakdown = await this.feeService.calculateForAmount(amount, challenge.creatorId.toString());
    const pendingOrder = await this.orderModel.create({
      buyerId: new Types.ObjectId(userId),
      creatorId: challenge.creatorId,
      contentType: TrackableContentType.CHALLENGE,
      contentId: challenge._id.toString(),
      amountDT: breakdown.amountDT,
      platformPercent: breakdown.platformPercent,
      platformFixedDT: breakdown.platformFixedDT,
      platformFeeDT: breakdown.platformFeeDT,
      creatorNetDT: breakdown.creatorNetDT,
      promoCode: appliedCode,
      discountDT,
      status: 'pending',
    });

    const successUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-success?scope=challenge&id=${challengeId}`;
    const failUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-failed?scope=challenge&id=${challengeId}`;
    const init = await this.flouci.initPayment({ amountTND: amount, successUrl, failUrl, metadata: { userId, contentType: 'challenge', contentId: challengeId } });
    if (!init.success) throw new BadRequestException(init.error);
    pendingOrder.paymentId = init.paymentId; await pendingOrder.save();
    return { link: init.link, paymentId: init.paymentId, qrCode: init.qrCode };
  }

  @Post('init/event')
  @ApiOperation({ summary: 'Initier un paiement Flouci pour un événement (billet)' })
  @ApiQuery({ name: 'promoCode', required: false })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async initEvent(
    @Body('eventId') eventId: string,
    @Body('ticketType') ticketType: string,
    @Req() req: any,
    @Query('promoCode') promoCode?: string,
  ) {
    const userId = (req.user?._id || req.user?.sub || '').toString();
    const offlineMode = (process.env.PAYMENT_MODE || 'instant') === 'offline';
    const event = await this.eventModel.findById(eventId);
    if (!event) throw new BadRequestException('Événement non trouvé');
    const alreadyRegistered = (event.attendees || []).some((attendee: any) => attendee?.userId?.toString() === userId);
    if (alreadyRegistered) {
      throw new BadRequestException('Vous êtes déjà inscrit à cet événement');
    }
    const ticket = event.tickets.find(t => t.type === ticketType);
    if (!ticket || (ticket.price || 0) <= 0) throw new BadRequestException('Billet invalide ou gratuit');
    let amount = ticket.price || 0; let discountDT = 0; let appliedCode: string | undefined;
    if (promoCode) {
      const buyer = await this.userModel.findById(userId).select('email');
      const promo = await this.promoService.validateAndApply(promoCode, amount, TrackableContentType.EVENT, (event as any)._id.toString(), (buyer as any)?.email);
      if (promo.valid) { amount = promo.finalAmountDT; discountDT = promo.discountDT; appliedCode = promo.appliedCode; }
    }
    const breakdown = await this.feeService.calculateForAmount(amount, event.creatorId.toString());
    const pendingOrder = await this.orderModel.create({
      buyerId: new Types.ObjectId(userId),
      creatorId: event.creatorId,
      contentType: TrackableContentType.EVENT,
      contentId: (event as any)._id.toString(),
      amountDT: breakdown.amountDT,
      platformPercent: breakdown.platformPercent,
      platformFixedDT: breakdown.platformFixedDT,
      platformFeeDT: breakdown.platformFeeDT,
      creatorNetDT: breakdown.creatorNetDT,
      promoCode: appliedCode,
      discountDT,
      status: 'pending',
    });
    const successUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-success?scope=event&id=${eventId}`;
    const failUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-failed?scope=event&id=${eventId}`;
    const init = await this.flouci.initPayment({ amountTND: amount, successUrl, failUrl, metadata: { userId, contentType: 'event', contentId: eventId, ticketType } });
    if (!init.success) throw new BadRequestException(init.error);
    pendingOrder.paymentId = init.paymentId; await pendingOrder.save();
    return { link: init.link, paymentId: init.paymentId, qrCode: init.qrCode };
  }

  @Post('init/product')
  @ApiOperation({ summary: 'Initier un paiement Flouci pour un produit' })
  @ApiQuery({ name: 'promoCode', required: false })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async initProduct(
    @Body('productId') productId: string,
    @Req() req: any,
    @Query('promoCode') promoCode?: string,
  ) {
    const userId = (req.user?._id || req.user?.sub || '').toString();
    const offlineMode = (process.env.PAYMENT_MODE || 'instant') === 'offline';
    let product = await this.productModel.findById(productId);
    if (!product) {
      product = await this.productModel.findOne({ id: productId });
    }
    if (!product) throw new BadRequestException('Produit non trouvé');
    const existingPaidOrder = await this.findExistingPaidProductOrder(userId, product);
    if (existingPaidOrder) {
      throw new BadRequestException('Product already purchased. You already have lifetime access.');
    }
    const price = product.price || 0; if (price <= 0) throw new BadRequestException('Produit gratuit');
    let amount = price; let discountDT = 0; let appliedCode: string | undefined;
    if (promoCode) {
      const buyer = await this.userModel.findById(userId).select('email');
      const promo = await this.promoService.validateAndApply(promoCode, price, TrackableContentType.PRODUCT, product._id.toString(), (buyer as any)?.email);
      if (promo.valid) { amount = promo.finalAmountDT; discountDT = promo.discountDT; appliedCode = promo.appliedCode; }
    }
    const breakdown = await this.feeService.calculateForAmount(amount, product.creatorId.toString());
    const pendingOrder = await this.orderModel.create({
      buyerId: new Types.ObjectId(userId),
      creatorId: product.creatorId,
      contentType: TrackableContentType.PRODUCT,
      contentId: product._id.toString(),
      amountDT: breakdown.amountDT,
      platformPercent: breakdown.platformPercent,
      platformFixedDT: breakdown.platformFixedDT,
      platformFeeDT: breakdown.platformFeeDT,
      creatorNetDT: breakdown.creatorNetDT,
      promoCode: appliedCode,
      discountDT,
      status: 'pending',
    });
    const successUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-success?scope=product&id=${productId}`;
    const failUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-failed?scope=product&id=${productId}`;
    const init = await this.flouci.initPayment({ amountTND: amount, successUrl, failUrl, metadata: { userId, contentType: 'product', contentId: productId } });
    if (!init.success) throw new BadRequestException(init.error);
    pendingOrder.paymentId = init.paymentId; await pendingOrder.save();
    return { link: init.link, paymentId: init.paymentId, qrCode: init.qrCode };
  }

  @Post('init/session')
  @ApiOperation({ summary: 'Initier un paiement Flouci pour une session 1-to-1' })
  @ApiQuery({ name: 'promoCode', required: false })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async initSession(
    @Body('sessionId') sessionId: string,
    @Req() req: any,
    @Query('promoCode') promoCode?: string,
  ) {
    const userId = (req.user?._id || req.user?.sub || '').toString();
    const offlineMode = (process.env.PAYMENT_MODE || 'instant') === 'offline';
    const session = await this.sessionModel.findById(sessionId);
    if (!session) throw new BadRequestException('Session non trouvée');
    const price = session.price || 0; if (price <= 0) throw new BadRequestException('Session gratuite');
    let amount = price; let discountDT = 0; let appliedCode: string | undefined;
    if (promoCode) {
      const buyer = await this.userModel.findById(userId).select('email');
      const promo = await this.promoService.validateAndApply(promoCode, price, TrackableContentType.SESSION, session._id.toString(), (buyer as any)?.email);
      if (promo.valid) { amount = promo.finalAmountDT; discountDT = promo.discountDT; appliedCode = promo.appliedCode; }
    }
    const breakdown = await this.feeService.calculateForAmount(amount, session.creatorId.toString());
    const pendingOrder = await this.orderModel.create({
      buyerId: new Types.ObjectId(userId),
      creatorId: session.creatorId,
      contentType: TrackableContentType.SESSION,
      contentId: session._id.toString(),
      amountDT: breakdown.amountDT,
      platformPercent: breakdown.platformPercent,
      platformFixedDT: breakdown.platformFixedDT,
      platformFeeDT: breakdown.platformFeeDT,
      creatorNetDT: breakdown.creatorNetDT,
      promoCode: appliedCode,
      discountDT,
      status: 'pending',
    });
    const successUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-success?scope=session&id=${sessionId}`;
    const failUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-failed?scope=session&id=${sessionId}`;
    const init = await this.flouci.initPayment({ amountTND: amount, successUrl, failUrl, metadata: { userId, contentType: 'session', contentId: sessionId } });
    if (!init.success) throw new BadRequestException(init.error);
    pendingOrder.paymentId = init.paymentId; await pendingOrder.save();
    return { link: init.link, paymentId: init.paymentId, qrCode: init.qrCode };
  }

  // ==================== STRIPE LINK ENDPOINTS ====================

  @Post('stripe-link/init/community')
  @ApiOperation({ summary: 'Initiate Stripe Link payment for community membership' })
  @ApiQuery({ name: 'promoCode', required: false })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async initStripeLinkCommunityPayment(
    @Body('communityId') communityId: string,
    @Body('inviteCode') inviteCode: string | undefined,
    @Req() req: any,
    @Body('channel') channelRaw?: string,
    @Body('successRedirectUrl') successRedirectUrl?: string,
    @Body('cancelRedirectUrl') cancelRedirectUrl?: string,
    @Body('clientContext') clientContextRaw?: Record<string, any>,
    @Query('promoCode') promoCode?: string,
  ) {
    const userId = (req.user?._id || req.user?.sub || '').toString();
    const channel = this.normalizePaymentChannel(channelRaw);
    const clientContext = this.normalizeClientContext(clientContextRaw);
    const community = await this.communityModel.findById(communityId);
    if (!community) throw new BadRequestException('Community not found');
    const validatedInviteCode = await this.assertPrivateInviteAccess(community, inviteCode);

    const price = community.fees_of_join || 0;
    if (price <= 0) throw new BadRequestException('Free community');

    let amount = price;
    let discountDT = 0;
    let appliedCode: string | undefined;
    if (promoCode) {
      const buyer = await this.userModel.findById(userId).select('email');
      const promo = await this.promoService.validateAndApply(promoCode, price, TrackableContentType.COMMUNITY, community._id.toString(), (buyer as any)?.email);
      if (promo.valid) {
        amount = promo.finalAmountDT;
        discountDT = promo.discountDT;
        appliedCode = promo.appliedCode;
      }
    }

    const breakdown = await this.feeService.calculateForAmount(amount, community.createur.toString());
    const metadata: Record<string, any> = {
      channel,
      ...(Object.keys(clientContext).length > 0 ? { clientContext } : {}),
      ...this.resolveAffiliateAttribution(req),
    };
    if (validatedInviteCode) {
      metadata.inviteCode = validatedInviteCode;
    }
    const pendingOrder = await this.orderModel.create({
      buyerId: new Types.ObjectId(userId),
      creatorId: community.createur,
      communityId: community._id,
      contentType: TrackableContentType.COMMUNITY,
      contentId: community._id.toString(),
      amountDT: breakdown.amountDT,
      platformPercent: breakdown.platformPercent,
      platformFixedDT: breakdown.platformFixedDT,
      platformFeeDT: breakdown.platformFeeDT,
      creatorNetDT: breakdown.creatorNetDT,
      promoCode: appliedCode,
      discountDT,
      status: 'pending',
      metadata: this.buildPendingFulfillmentMetadata(metadata),
    });

    const defaultSuccessUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-success?scope=community&id=${communityId}&provider=stripe&sessionId={CHECKOUT_SESSION_ID}`;
    const defaultFailUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-failed?scope=community&id=${communityId}&provider=stripe`;
    const successUrl = this.resolveCheckoutRedirectUrl(defaultSuccessUrl, successRedirectUrl);
    const failUrl = this.resolveCheckoutRedirectUrl(defaultFailUrl, cancelRedirectUrl);

    console.log('[Stripe Init] Generated Success URL:', successUrl);

    const user = await this.userModel.findById(userId).select('email name');
    const session = await this.stripe.createLinkCheckoutSession({
      amountDT: amount,
      successUrl,
      cancelUrl: failUrl,
      customerEmail: user?.email,
      metadata: {
        userId,
        contentType: 'community',
        contentId: communityId,
        orderId: pendingOrder._id.toString(),
        channel,
        ...(Object.keys(clientContext).length > 0 ? { clientContext: JSON.stringify(clientContext) } : {}),
        ...(validatedInviteCode ? { inviteCode: validatedInviteCode } : {}),
      },
      lineItems: [{
        name: `Join ${community.name}`,
        description: `Community membership for ${community.name}`,
        amount: amount,
        quantity: 1
      }]
    });

    if (!session.success) throw new BadRequestException(session.error);

    pendingOrder.paymentId = session.sessionId;
    await pendingOrder.save();

    return this.buildStripeInitResponse({
      scope: 'community',
      targetId: communityId,
      orderId: pendingOrder._id.toString(),
      sessionId: session.sessionId,
      checkoutUrl: session.url,
      extra: {
        channel,
      },
    });
  }

  @Post('stripe-link/init/course')
  @ApiOperation({ summary: 'Initiate Stripe Link payment for course enrollment' })
  @ApiQuery({ name: 'promoCode', required: false })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async initStripeLinkCoursePayment(
    @Body('courseId') courseId: string,
    @Req() req: any,
    @Body('channel') channelRaw?: string,
    @Body('successRedirectUrl') successRedirectUrl?: string,
    @Body('cancelRedirectUrl') cancelRedirectUrl?: string,
    @Body('clientContext') clientContextRaw?: Record<string, any>,
    @Query('promoCode') promoCode?: string,
  ) {
    const userId = (req.user?._id || req.user?.sub || '').toString();
    const channel = this.normalizePaymentChannel(channelRaw);
    const clientContext = this.normalizeClientContext(clientContextRaw);
    let cours: CoursDocument | null = null;
    if (Types.ObjectId.isValid(courseId)) {
      cours = await this.coursModel.findById(courseId);
    }
    if (!cours) {
      cours = await this.coursModel.findOne({ id: courseId });
    }
    if (!cours) throw new BadRequestException('Course not found');
    const courseObjectId = cours._id;
    const coursePublicId = cours.id || courseObjectId.toString();

    const price = cours.prix || 0;
    if (price <= 0) throw new BadRequestException('Free course');

    const courseCurrency = ((cours as any)?.devise || (cours as any)?.pricing?.currency || 'TND').toString();

    let amount = price;
    let discountDT = 0;
    let appliedCode: string | undefined;
    if (promoCode) {
      const buyer = await this.userModel.findById(userId).select('email');
      const promo = await this.promoService.validateAndApply(promoCode, price, TrackableContentType.COURSE, cours._id.toString(), (buyer as any)?.email);
      if (promo.valid) {
        amount = promo.finalAmountDT;
        discountDT = promo.discountDT;
        appliedCode = promo.appliedCode;
      }
    }

    const breakdown = await this.feeService.calculateForAmount(amount, cours.creatorId.toString());
    const pendingOrder = await this.orderModel.create({
      buyerId: new Types.ObjectId(userId),
      creatorId: cours.creatorId,
      contentType: TrackableContentType.COURSE,
      contentId: cours._id.toString(),
      amountDT: breakdown.amountDT,
      platformPercent: breakdown.platformPercent,
      platformFixedDT: breakdown.platformFixedDT,
      platformFeeDT: breakdown.platformFeeDT,
      creatorNetDT: breakdown.creatorNetDT,
      promoCode: appliedCode,
      discountDT,
      status: 'pending',
      metadata: this.buildPendingFulfillmentMetadata({
        channel,
        ...(Object.keys(clientContext).length > 0 ? { clientContext } : {}),
        ...this.resolveAffiliateAttribution(req),
      }),
    });

    const defaultSuccessUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-success?scope=course&id=${coursePublicId}&provider=stripe&sessionId={CHECKOUT_SESSION_ID}`;
    const defaultFailUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-failed?scope=course&id=${courseId}&provider=stripe`;
    const successUrl = this.resolveCheckoutRedirectUrl(defaultSuccessUrl, successRedirectUrl);
    const failUrl = this.resolveCheckoutRedirectUrl(defaultFailUrl, cancelRedirectUrl);

    const user = await this.userModel.findById(userId).select('email name');
    const session = await this.stripe.createLinkCheckoutSession({
      amountDT: amount,
      currency: courseCurrency.toLowerCase(),
      successUrl,
      cancelUrl: failUrl,
      customerEmail: user?.email,
      metadata: {
        userId,
        contentType: 'course',
        contentId: courseId,
        orderId: pendingOrder._id.toString(),
        channel,
        ...(Object.keys(clientContext).length > 0 ? { clientContext: JSON.stringify(clientContext) } : {}),
      },
      lineItems: [{
        name: cours.titre,
        description: cours.description,
        amount: amount,
        quantity: 1
      }]
    });

    if (!session.success) throw new BadRequestException(session.error);

    pendingOrder.paymentId = session.sessionId;
    await pendingOrder.save();

    return this.buildStripeInitResponse({
      scope: 'course',
      targetId: coursePublicId,
      orderId: pendingOrder._id.toString(),
      sessionId: session.sessionId,
      checkoutUrl: session.url,
      extra: {
        channel,
      },
    });
  }

  @Post('stripe-link/init/challenge')
  @ApiOperation({ summary: 'Initiate Stripe Link payment for challenge participation' })
  @ApiQuery({ name: 'promoCode', required: false })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async initStripeLinkChallengePayment(
    @Body('challengeId') challengeId: string,
    @Req() req: any,
    @Body('channel') channelRaw?: string,
    @Body('successRedirectUrl') successRedirectUrl?: string,
    @Body('cancelRedirectUrl') cancelRedirectUrl?: string,
    @Body('clientContext') clientContextRaw?: Record<string, any>,
    @Query('promoCode') promoCode?: string,
  ) {
    const userId = (req.user?._id || req.user?.sub || '').toString();
    const channel = this.normalizePaymentChannel(channelRaw);
    const clientContext = this.normalizeClientContext(clientContextRaw);
    const challenge = await this.challengeModel.findOne({ id: challengeId }) || await this.challengeModel.findById(challengeId);
    if (!challenge) throw new BadRequestException('Challenge not found');

    const pricing = (challenge as any)?.pricing || {};
    const depositAmount = pricing.depositAmount ?? (challenge as any)?.depositAmount ?? 0;
    const participationFee = pricing.participationFee ?? pricing.price ?? (challenge as any)?.participationFee ?? 0;
    const shouldUseDeposit = Boolean(pricing.depositRequired || depositAmount > 0);
    const baseAmount = shouldUseDeposit ? depositAmount : participationFee;
    if (!baseAmount || baseAmount <= 0) throw new BadRequestException('Free challenge');
    const challengeCurrency = (pricing.currency || (challenge as any)?.currency || 'TND').toString();

    let amount = baseAmount;
    let discountDT = 0;
    let appliedCode: string | undefined;
    if (promoCode) {
      const buyer = await this.userModel.findById(userId).select('email');
      const promo = await this.promoService.validateAndApply(promoCode, baseAmount, TrackableContentType.CHALLENGE, challenge._id.toString(), (buyer as any)?.email);
      if (promo.valid) {
        amount = promo.finalAmountDT;
        discountDT = promo.discountDT;
        appliedCode = promo.appliedCode;
      }
    }

    const breakdown = await this.feeService.calculateForAmount(amount, challenge.creatorId.toString());
    const pendingOrder = await this.orderModel.create({
      buyerId: new Types.ObjectId(userId),
      creatorId: challenge.creatorId,
      contentType: TrackableContentType.CHALLENGE,
      contentId: challenge._id.toString(),
      amountDT: breakdown.amountDT,
      platformPercent: breakdown.platformPercent,
      platformFixedDT: breakdown.platformFixedDT,
      platformFeeDT: breakdown.platformFeeDT,
      creatorNetDT: breakdown.creatorNetDT,
      promoCode: appliedCode,
      discountDT,
      status: 'pending',
      metadata: this.buildPendingFulfillmentMetadata({
        channel,
        ...(Object.keys(clientContext).length > 0 ? { clientContext } : {}),
        ...this.resolveAffiliateAttribution(req),
      }),
    });

    const defaultSuccessUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-success?scope=challenge&id=${challengeId}&provider=stripe&sessionId={CHECKOUT_SESSION_ID}`;
    const defaultFailUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-failed?scope=challenge&id=${challengeId}&provider=stripe`;
    const successUrl = this.resolveCheckoutRedirectUrl(defaultSuccessUrl, successRedirectUrl);
    const failUrl = this.resolveCheckoutRedirectUrl(defaultFailUrl, cancelRedirectUrl);

    const user = await this.userModel.findById(userId).select('email name');
    const session = await this.stripe.createLinkCheckoutSession({
      amountDT: amount,
      currency: challengeCurrency.toLowerCase(),
      successUrl,
      cancelUrl: failUrl,
      customerEmail: user?.email,
      metadata: {
        userId,
        contentType: 'challenge',
        contentId: challengeId,
        orderId: pendingOrder._id.toString(),
        channel,
        ...(Object.keys(clientContext).length > 0 ? { clientContext: JSON.stringify(clientContext) } : {}),
      },
      lineItems: [{
        name: challenge.title || 'Challenge',
        description: challenge.description,
        amount: amount,
        quantity: 1
      }]
    });

    if (!session.success) throw new BadRequestException(session.error);

    pendingOrder.paymentId = session.sessionId;
    await pendingOrder.save();

    return this.buildStripeInitResponse({
      scope: 'challenge',
      targetId: challengeId,
      orderId: pendingOrder._id.toString(),
      sessionId: session.sessionId,
      checkoutUrl: session.url,
      extra: {
        channel,
      },
    });
  }

  @Post('stripe-link/init/event')
  @ApiOperation({ summary: 'Initiate Stripe Link payment for event ticket' })
  @ApiQuery({ name: 'promoCode', required: false })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async initStripeLinkEventPayment(
    @Body('eventId') eventId: string,
    @Body('ticketType') ticketType: string,
    @Req() req: any,
    @Body('channel') channelRaw?: string,
    @Body('successRedirectUrl') successRedirectUrl?: string,
    @Body('cancelRedirectUrl') cancelRedirectUrl?: string,
    @Body('clientContext') clientContextRaw?: Record<string, any>,
    @Query('promoCode') promoCode?: string,
  ) {
    const userId = (req.user?._id || req.user?.sub || '').toString();
    const channel = this.normalizePaymentChannel(channelRaw);
    const clientContext = this.normalizeClientContext(clientContextRaw);
    const event = await this.eventModel.findOne({ id: eventId }) || await this.eventModel.findById(eventId);
    if (!event) throw new BadRequestException('Event not found');
    const alreadyRegistered = (event.attendees || []).some((attendee: any) => attendee?.userId?.toString() === userId);
    if (alreadyRegistered) {
      throw new BadRequestException('Vous êtes déjà inscrit à cet événement');
    }

    const ticket = event.tickets.find(t => t.type === ticketType || t.id === ticketType);
    if (!ticket) throw new BadRequestException('Ticket type not found');

    const price = ticket.price || 0;
    if (price <= 0) throw new BadRequestException('Free ticket');
    const eventCurrency = ((event as any)?.pricing?.currency || (event as any)?.currency || 'TND').toString();

    let amount = price;
    let discountDT = 0;
    let appliedCode: string | undefined;
    if (promoCode) {
      const buyer = await this.userModel.findById(userId).select('email');
      const promo = await this.promoService.validateAndApply(promoCode, price, TrackableContentType.EVENT, event._id.toString(), (buyer as any)?.email);
      if (promo.valid) {
        amount = promo.finalAmountDT;
        discountDT = promo.discountDT;
        appliedCode = promo.appliedCode;
      }
    }

    const breakdown = await this.feeService.calculateForAmount(amount, event.creatorId.toString());
    const pendingOrder = await this.orderModel.create({
      buyerId: new Types.ObjectId(userId),
      creatorId: event.creatorId,
      contentType: TrackableContentType.EVENT,
      contentId: event._id.toString(),
      amountDT: breakdown.amountDT,
      platformPercent: breakdown.platformPercent,
      platformFixedDT: breakdown.platformFixedDT,
      platformFeeDT: breakdown.platformFeeDT,
      creatorNetDT: breakdown.creatorNetDT,
      promoCode: appliedCode,
      discountDT,
      status: 'pending',
      metadata: this.buildPendingFulfillmentMetadata({
        ticketType,
        channel,
        ...(Object.keys(clientContext).length > 0 ? { clientContext } : {}),
        ...this.resolveAffiliateAttribution(req),
      })
    });

    const defaultSuccessUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-success?scope=event&id=${eventId}&provider=stripe&sessionId={CHECKOUT_SESSION_ID}`;
    const defaultFailUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-failed?scope=event&id=${eventId}&provider=stripe`;
    const successUrl = this.resolveCheckoutRedirectUrl(defaultSuccessUrl, successRedirectUrl);
    const failUrl = this.resolveCheckoutRedirectUrl(defaultFailUrl, cancelRedirectUrl);

    const user = await this.userModel.findById(userId).select('email name');
    const session = await this.stripe.createLinkCheckoutSession({
      amountDT: amount,
      currency: eventCurrency.toLowerCase(),
      successUrl,
      cancelUrl: failUrl,
      customerEmail: user?.email,
      metadata: {
        userId,
        contentType: 'event',
        contentId: eventId,
        orderId: pendingOrder._id.toString(),
        ticketType,
        channel,
        ...(Object.keys(clientContext).length > 0 ? { clientContext: JSON.stringify(clientContext) } : {}),
      },
      lineItems: [{
        name: event.title || 'Event Ticket',
        description: `${ticket.name} for ${event.title}`,
        amount: amount,
        quantity: 1
      }]
    });

    if (!session.success) throw new BadRequestException(session.error);

    pendingOrder.paymentId = session.sessionId;
    await pendingOrder.save();

    return this.buildStripeInitResponse({
      scope: 'event',
      targetId: eventId,
      orderId: pendingOrder._id.toString(),
      sessionId: session.sessionId,
      checkoutUrl: session.url,
      extra: {
        channel,
      },
    });
  }

  @Post('stripe-link/init/product')
  @ApiOperation({ summary: 'Initiate Stripe Link payment for product' })
  @ApiQuery({ name: 'promoCode', required: false })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async initStripeLinkProductPayment(
    @Body('productId') productId: string,
    @Req() req: any,
    @Body('channel') channelRaw?: string,
    @Body('successRedirectUrl') successRedirectUrl?: string,
    @Body('cancelRedirectUrl') cancelRedirectUrl?: string,
    @Body('clientContext') clientContextRaw?: Record<string, any>,
    @Query('promoCode') promoCode?: string,
  ) {
    const userId = (req.user?._id || req.user?.sub || '').toString();
    const channel = this.normalizePaymentChannel(channelRaw);
    const clientContext = this.normalizeClientContext(clientContextRaw);
    const product = await this.productModel.findOne({ id: productId }) || await this.productModel.findById(productId);
    if (!product) throw new BadRequestException('Product not found');
    const existingPaidOrder = await this.findExistingPaidProductOrder(userId, product);
    if (existingPaidOrder) {
      throw new BadRequestException('Product already purchased. You already have lifetime access.');
    }

    const price = product.price || 0;
    if (price <= 0) throw new BadRequestException('Free product');

    let amount = price;
    let discountDT = 0;
    let appliedCode: string | undefined;
    if (promoCode) {
      const buyer = await this.userModel.findById(userId).select('email');
      const promo = await this.promoService.validateAndApply(promoCode, price, TrackableContentType.PRODUCT, product._id.toString(), (buyer as any)?.email);
      if (promo.valid) {
        amount = promo.finalAmountDT;
        discountDT = promo.discountDT;
        appliedCode = promo.appliedCode;
      }
    }

    const breakdown = await this.feeService.calculateForAmount(amount, product.creatorId.toString());
    const pendingOrder = await this.orderModel.create({
      buyerId: new Types.ObjectId(userId),
      creatorId: product.creatorId,
      contentType: TrackableContentType.PRODUCT,
      contentId: product._id.toString(),
      amountDT: breakdown.amountDT,
      platformPercent: breakdown.platformPercent,
      platformFixedDT: breakdown.platformFixedDT,
      platformFeeDT: breakdown.platformFeeDT,
      creatorNetDT: breakdown.creatorNetDT,
      promoCode: appliedCode,
      discountDT,
      status: 'pending',
      metadata: this.buildPendingFulfillmentMetadata({
        channel,
        ...(Object.keys(clientContext).length > 0 ? { clientContext } : {}),
        ...this.resolveAffiliateAttribution(req),
      }),
    });

    const defaultSuccessUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-success?scope=product&id=${productId}&provider=stripe&sessionId={CHECKOUT_SESSION_ID}`;
    const defaultFailUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-failed?scope=product&id=${productId}&provider=stripe`;
    const successUrl = this.resolveCheckoutRedirectUrl(defaultSuccessUrl, successRedirectUrl);
    const failUrl = this.resolveCheckoutRedirectUrl(defaultFailUrl, cancelRedirectUrl);

    const user = await this.userModel.findById(userId).select('email name');
    const session = await this.stripe.createLinkCheckoutSession({
      amountDT: amount,
      successUrl,
      cancelUrl: failUrl,
      customerEmail: user?.email,
      metadata: {
        userId,
        contentType: 'product',
        contentId: productId,
        orderId: pendingOrder._id.toString(),
        channel,
        ...(Object.keys(clientContext).length > 0 ? { clientContext: JSON.stringify(clientContext) } : {}),
      },
      lineItems: [{
        name: product.title || 'Product',
        description: product.description,
        amount: amount,
        quantity: 1
      }]
    });

    if (!session.success) throw new BadRequestException(session.error);

    pendingOrder.paymentId = session.sessionId;
    await pendingOrder.save();

    return this.buildStripeInitResponse({
      scope: 'product',
      targetId: productId,
      orderId: pendingOrder._id.toString(),
      sessionId: session.sessionId,
      checkoutUrl: session.url,
      extra: {
        channel,
      },
    });
  }

  @Post('stripe-link/init/session')
  @ApiOperation({ summary: 'Initiate Stripe Link payment for 1-to-1 session' })
  @ApiQuery({ name: 'promoCode', required: false })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async initStripeLinkSessionPayment(
    @Body('sessionId') sessionId: string,
    @Body('bookingDto') bookingDto: any,
    @Req() req: any,
    @Body('channel') channelRaw?: string,
    @Body('successRedirectUrl') successRedirectUrl?: string,
    @Body('cancelRedirectUrl') cancelRedirectUrl?: string,
    @Body('clientContext') clientContextRaw?: Record<string, any>,
    @Query('promoCode') promoCode?: string,
  ) {
    const userId = (req.user?._id || req.user?.sub || '').toString();
    const channel = this.normalizePaymentChannel(channelRaw);
    const clientContext = this.normalizeClientContext(clientContextRaw);
    const sessionDoc = await this.sessionModel.findOne({ id: sessionId }) || await this.sessionModel.findById(sessionId);
    if (!sessionDoc) throw new BadRequestException('Session not found');
    if (sessionDoc.creatorId?.toString() === userId) {
      throw new BadRequestException('Vous ne pouvez pas réserver votre propre session');
    }

    const price = sessionDoc.price || 0;
    if (price <= 0) throw new BadRequestException('Free session');

    let amount = price;
    let discountDT = 0;
    let appliedCode: string | undefined;
    if (promoCode) {
      const buyer = await this.userModel.findById(userId).select('email');
      const promo = await this.promoService.validateAndApply(promoCode, price, TrackableContentType.SESSION, sessionDoc._id.toString(), (buyer as any)?.email);
      if (promo.valid) {
        amount = promo.finalAmountDT;
        discountDT = promo.discountDT;
        appliedCode = promo.appliedCode;
      }
    }

    const breakdown = await this.feeService.calculateForAmount(amount, sessionDoc.creatorId.toString());
    const pendingOrder = await this.orderModel.create({
      buyerId: new Types.ObjectId(userId),
      creatorId: sessionDoc.creatorId,
      contentType: TrackableContentType.SESSION,
      contentId: sessionDoc._id.toString(),
      amountDT: breakdown.amountDT,
      platformPercent: breakdown.platformPercent,
      platformFixedDT: breakdown.platformFixedDT,
      platformFeeDT: breakdown.platformFeeDT,
      creatorNetDT: breakdown.creatorNetDT,
      promoCode: appliedCode,
      discountDT,
      status: 'pending',
      metadata: this.buildPendingFulfillmentMetadata({
        bookingDto,
        contentId: sessionId,
        slotId: bookingDto?.slotId,
        channel,
        ...(Object.keys(clientContext).length > 0 ? { clientContext } : {}),
        ...this.resolveAffiliateAttribution(req),
      })
    });

    const defaultSuccessUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-success?scope=session&id=${sessionId}&provider=stripe&sessionId={CHECKOUT_SESSION_ID}`;
    const defaultFailUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-failed?scope=session&id=${sessionId}&provider=stripe`;
    const successUrl = this.resolveCheckoutRedirectUrl(defaultSuccessUrl, successRedirectUrl);
    const failUrl = this.resolveCheckoutRedirectUrl(defaultFailUrl, cancelRedirectUrl);

    const user = await this.userModel.findById(userId).select('email name');
    const session = await this.stripe.createLinkCheckoutSession({
      amountDT: amount,
      successUrl,
      cancelUrl: failUrl,
      customerEmail: user?.email,
      metadata: {
        userId,
        contentType: 'session',
        contentId: sessionId,
        orderId: pendingOrder._id.toString(),
        bookingDto: JSON.stringify(bookingDto), // Serialize object to string
        channel,
        ...(Object.keys(clientContext).length > 0 ? { clientContext: JSON.stringify(clientContext) } : {}),
      },
      lineItems: [{
        name: sessionDoc.title || 'Session',
        description: sessionDoc.description,
        amount: amount,
        quantity: 1
      }]
    });

    if (!session.success) throw new BadRequestException(session.error);

    pendingOrder.paymentId = session.sessionId;
    await pendingOrder.save();

    return this.buildStripeInitResponse({
      scope: 'session',
      targetId: sessionId,
      orderId: pendingOrder._id.toString(),
      sessionId: session.sessionId,
      checkoutUrl: session.url,
      extra: {
        channel,
      },
    });
  }

  @Post('stripe-link/init/subscription')
  @ApiOperation({ summary: 'Initiate Stripe Link subscription payment' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async initStripeLinkSubscription(
    @Req() req: any,
    @Body('tier') tier: string,
    @Body('interval') interval: 'month' | 'year' = 'month',
    @Body('channel') channelRaw?: string,
    @Body('successRedirectUrl') successRedirectUrl?: string,
    @Body('cancelRedirectUrl') cancelRedirectUrl?: string,
    @Body('clientContext') clientContextRaw?: Record<string, any>,
  ) {
    const userId = (req.user?._id || req.user?.sub || '').toString();
    const channel = this.normalizePaymentChannel(channelRaw);
    const clientContext = this.normalizeClientContext(clientContextRaw);
    const plan = await this.planModel.findOne({ tier, isActive: true });
    if (!plan) throw new BadRequestException('Plan not found');

    const amount = interval === 'year'
      ? (plan as any).priceYearlyDT || (plan as any).priceDT * 12
      : (plan as any).priceMonthlyDT || (plan as any).priceDT;

    if (amount <= 0) throw new BadRequestException('Invalid amount');

    const breakdown = await this.feeService.calculateForAmount(amount, userId);
    const pendingOrder = await this.orderModel.create({
      buyerId: new Types.ObjectId(userId),
      creatorId: new Types.ObjectId(userId),
      contentType: TrackableContentType.SUBSCRIPTION,
      contentId: tier,
      amountDT: breakdown.amountDT,
      platformPercent: breakdown.platformPercent,
      platformFixedDT: breakdown.platformFixedDT,
      platformFeeDT: breakdown.platformFeeDT,
      creatorNetDT: breakdown.creatorNetDT,
      status: 'pending',
      metadata: this.buildPendingFulfillmentMetadata({
        channel,
        ...(Object.keys(clientContext).length > 0 ? { clientContext } : {}),
        ...this.resolveAffiliateAttribution(req),
      }),
    });

    // Create Stripe price for the subscription
    const priceResult = await this.stripe.createPrice({
      amountDT: amount,
      interval,
      productName: `${plan.name} Plan`,
      productDescription: `Subscription to ${plan.name} plan`
    });

    if (!priceResult.success) throw new BadRequestException(priceResult.error);

    const defaultSuccessUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-success?scope=subscription&tier=${tier}&provider=stripe&sessionId={CHECKOUT_SESSION_ID}`;
    const defaultFailUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-failed?scope=subscription&tier=${tier}&provider=stripe`;
    const successUrl = this.resolveCheckoutRedirectUrl(defaultSuccessUrl, successRedirectUrl);
    const failUrl = this.resolveCheckoutRedirectUrl(defaultFailUrl, cancelRedirectUrl);

    const user = await this.userModel.findById(userId).select('email name');
    const session = await this.stripe.createLinkSubscriptionSession({
      priceId: priceResult.priceId!,
      successUrl,
      cancelUrl: failUrl,
      customerEmail: user?.email,
      metadata: {
        userId,
        contentType: 'subscription',
        tier,
        orderId: pendingOrder._id.toString(),
        channel,
        ...(Object.keys(clientContext).length > 0 ? { clientContext: JSON.stringify(clientContext) } : {}),
      },
      trialPeriodDays: plan.trialDays
    });

    if (!session.success) throw new BadRequestException(session.error);

    pendingOrder.paymentId = session.sessionId;
    await pendingOrder.save();

    return this.buildStripeInitResponse({
      scope: 'subscription',
      targetId: tier,
      orderId: pendingOrder._id.toString(),
      sessionId: session.sessionId,
      checkoutUrl: session.url,
      extra: {
        channel,
        interval,
      },
    });
  }



  private parseBookingDto(raw: any): any {
    if (!raw) return {};
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch {
        return {};
      }
    }
    return typeof raw === 'object' ? raw : {};
  }

  private getErrorMessage(error: any): string {
    const response = error?.getResponse?.();
    if (typeof response === 'string') return response;
    if (Array.isArray(response?.message)) return response.message.join(', ');
    if (typeof response?.message === 'string') return response.message;
    if (typeof error?.message === 'string') return error.message;
    return 'Unknown error';
  }

  private isTransactionNotSupportedError(error: any): boolean {
    const response = error?.getResponse?.();
    const responseMessage = Array.isArray(response?.message)
      ? response.message.join(', ')
      : (typeof response?.message === 'string' ? response.message : (typeof response === 'string' ? response : ''));
    const message = String(
      error?.errorResponse?.errmsg ||
      error?.cause?.errorResponse?.errmsg ||
      responseMessage ||
      error?.message ||
      error?.cause?.message ||
      '',
    ).toLowerCase();
    const code = error?.code ?? error?.errorResponse?.code ?? error?.cause?.code ?? error?.cause?.errorResponse?.code;
    const codeName = String(
      error?.codeName ||
      error?.errorResponse?.codeName ||
      error?.cause?.codeName ||
      error?.cause?.errorResponse?.codeName ||
      '',
    ).toLowerCase();

    return (
      code === 20 ||
      codeName === 'illegaloperation' ||
      message.includes('transaction numbers are only allowed on a replica set member or mongos')
    );
  }

  private async detectMongoTransactionSupport(): Promise<boolean> {
    if (this.mongoTransactionSupport !== null) {
      return this.mongoTransactionSupport;
    }

    try {
      const adminDb = this.orderModel.db?.db?.admin?.();
      if (!adminDb) {
        this.logger.warn(
          '[PAYMENT] Mongo admin database is unavailable. Falling back to non-transactional execution.',
        );
        this.mongoTransactionSupport = false;
        return false;
      }

      const hello = await adminDb.command({ hello: 1 });
      const isReplicaSet = Boolean(hello?.setName);
      const isMongos = hello?.msg === 'isdbgrid';
      const supportsTransactions = isReplicaSet || isMongos;

      this.mongoTransactionSupport = supportsTransactions;
      if (supportsTransactions) {
        this.logger.log('[PAYMENT] MongoDB transactions enabled (replica set/mongos detected).');
      } else {
        this.logger.warn(
          '[PAYMENT] MongoDB standalone detected. Payment fulfillment will run without transactions.',
        );
      }

      return supportsTransactions;
    } catch (error: any) {
      this.mongoTransactionSupport = false;
      this.logger.warn(
        `[PAYMENT] Unable to detect MongoDB transaction support. Using non-transactional mode. reason=${error?.message || error}`,
      );
      return false;
    }
  }

  private async runWithOptionalTransaction<T>(work: (session: any | null) => Promise<T>): Promise<T> {
    const supportsTransactions = await this.detectMongoTransactionSupport();
    if (!supportsTransactions) {
      return await work(null);
    }

    try {
      return await this.orderModel.db.transaction(async (session) => {
        return await work(session);
      });
    } catch (error: any) {
      if (!this.isTransactionNotSupportedError(error)) {
        throw error;
      }

      this.mongoTransactionSupport = false;
      this.logger.warn(
        '[PAYMENT] MongoDB transactions are unavailable. Falling back to non-transactional execution.',
      );
      return await work(null);
    }
  }

  private buildBuyerIdFilter(userId: string): any {
    if (Types.ObjectId.isValid(userId)) {
      return { $in: [new Types.ObjectId(userId), userId] };
    }
    return userId;
  }

  private buildProductContentIdCandidates(product: ProductDocument): string[] {
    return Array.from(
      new Set([String(product?._id || ''), String((product as any)?.id || '')].filter(Boolean)),
    );
  }

  private async findExistingPaidProductOrder(
    userId: string,
    product: ProductDocument,
  ): Promise<OrderDocument | null> {
    const buyerFilter = this.buildBuyerIdFilter(userId);
    const productIds = this.buildProductContentIdCandidates(product);
    if (!productIds.length) return null;

    return this.orderModel
      .findOne({
        buyerId: buyerFilter,
        contentType: TrackableContentType.PRODUCT,
        contentId: { $in: productIds },
        status: 'paid',
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  private async incrementProductSalesFromOrder(order: any): Promise<void> {
    if (!order || order.contentType !== TrackableContentType.PRODUCT) return;
    if (!order?._id) return;

    const salesMark = await this.orderModel
      .updateOne(
        {
          _id: order._id,
          'metadata.productSaleCounted': { $ne: true },
        },
        {
          $set: { 'metadata.productSaleCounted': true },
        },
      )
      .exec();

    if (Number(salesMark?.modifiedCount || 0) === 0) return;

    const contentId = String(order.contentId || '').trim();
    if (!contentId) return;

    const query = Types.ObjectId.isValid(contentId)
      ? { _id: new Types.ObjectId(contentId) }
      : { id: contentId };

    await this.productModel.updateOne(query, { $inc: { sales: 1 } }).exec();
  }

  private isMissingScheduledAtError(error: any): boolean {
    const message = this.getErrorMessage(error).toLowerCase();
    return message.includes('la date de la session est obligatoire');
  }

  private isAlreadyRegisteredEventError(error: any): boolean {
    const message = this.getErrorMessage(error).toLowerCase();
    return message.includes('déjà inscrit') || message.includes('already registered');
  }

  private async findSessionByAnyId(sessionId: string, dbSession: any = null): Promise<SessionDocument | null> {
    let sessionDoc = await this.sessionModel.findOne({ id: sessionId }).session(dbSession);
    if (!sessionDoc && Types.ObjectId.isValid(sessionId)) {
      sessionDoc = await this.sessionModel.findById(sessionId).session(dbSession);
    }
    return sessionDoc;
  }

  private async resolveScheduledAtFromSlot(sessionId: string, slotId: string, dbSession: any = null): Promise<string | undefined> {
    if (!slotId) return undefined;
    const sessionDoc = await this.findSessionByAnyId(sessionId, dbSession);
    if (!sessionDoc) return undefined;
    const slot = (sessionDoc.availableSlots || []).find((s: any) => String(s?.id) === String(slotId));
    if (!slot?.startTime) return undefined;
    return new Date(slot.startTime).toISOString();
  }

  private resolveMemberDisplayName(user: any): string {
    const explicitName = String(user?.name || '').trim();
    if (explicitName) return explicitName;

    const firstName = String(user?.firstName || '').trim();
    const lastName = String(user?.lastName || '').trim();
    const fullName = `${firstName} ${lastName}`.trim();
    if (fullName) return fullName;

    const username = String(user?.username || '').trim();
    if (username) return username;

    return 'A new member';
  }

  private async notifyCommunityCreatorMemberJoined(
    community: CommunityDocument,
    buyerId: Types.ObjectId | string,
  ): Promise<void> {
    const buyerIdString = String(buyerId || '');
    const creatorIdString = String(community?.createur || '');
    if (!buyerIdString || !creatorIdString || buyerIdString === creatorIdString) {
      return;
    }

    try {
      const buyer = await this.userModel
        .findById(buyerIdString)
        .select('name username firstName lastName')
        .lean();
      const buyerName = this.resolveMemberDisplayName(buyer);

      await this.notificationService.createNotification({
        recipient: creatorIdString,
        sender: buyerIdString,
        type: 'new_community_member',
        title: 'New Member',
        body: `${buyerName} has joined your community ${community.name}`,
        data: {
          communityId: community._id.toString(),
          userId: buyerIdString,
          memberName: buyerName,
        },
      });
    } catch (error: any) {
      this.logger.warn(
        `Failed to create creator notification for community join (communityId=${community?._id?.toString?.()}, buyerId=${buyerIdString}): ${error?.message || error}`,
      );
    }
  }

  private async grantAccess(order: any, session: any = null, stripeSessionMetadata?: Record<string, string>) {
    this.logger.log(`Granting access for order ${order._id} (Type: ${order.contentType})`);

    switch (order.contentType) {
      case TrackableContentType.COMMUNITY:
        const community = await this.communityModel.findById(order.contentId).session(session);
        if (community) {
          community.addMember(order.buyerId);
          await community.save({ session });

          const userUpdateQuery = this.userModel.findByIdAndUpdate(order.buyerId, {
            $addToSet: { joinedCommunities: community._id },
          });
          if (session) {
            userUpdateQuery.session(session);
          }
          await userUpdateQuery.exec();

          await this.notifyCommunityCreatorMemberJoined(community, order.buyerId);
        }
        break;

      case TrackableContentType.SUBSCRIPTION:
        const tier = (order.contentId || 'STARTER') as PlanTier;
        await this.subscriptionService.upgradePlan(order.buyerId.toString(), tier, session);
        break;

      case TrackableContentType.COURSE:
        await this.coursService.inscrireAuCours(order.contentId, order.buyerId.toString(), order.promoCode, session);
        break;

      case TrackableContentType.CHALLENGE:
        await this.challengeService.joinChallenge({ challengeId: order.contentId } as any, order.buyerId.toString(), session);
        break;

      case TrackableContentType.EVENT:
        // Use metadata ticketType if available
        const ticketType = order.metadata?.ticketType || 'standard';
        try {
          await this.eventService.registerAttendee(order.contentId, ticketType, order.buyerId.toString(), order.promoCode);
        } catch (error: any) {
          if (this.isAlreadyRegisteredEventError(error)) {
            this.logger.warn(`Skipping duplicate event registration for order ${order._id}: buyer already registered`);
            break;
          }
          throw error;
        }
        break;

      case TrackableContentType.SESSION:
        if (order.creatorId?.toString() === order.buyerId?.toString()) {
          this.logger.warn(`Skipping self-booking for session order ${order._id}`);
          break;
        }
        const bookingSessionId = order.metadata?.contentId || stripeSessionMetadata?.contentId || order.contentId;
        const orderBookingDto = this.parseBookingDto(order.metadata?.bookingDto);
        const stripeBookingDto = this.parseBookingDto(stripeSessionMetadata?.bookingDto);
        const bookingDto: any = {
          ...stripeBookingDto,
          ...orderBookingDto,
        };

        const slotId =
          bookingDto.slotId ||
          order.metadata?.slotId ||
          stripeSessionMetadata?.slotId;

        if (!bookingDto.scheduledAt && slotId) {
          const scheduledAtFromSlot = await this.resolveScheduledAtFromSlot(bookingSessionId, slotId, session);
          if (scheduledAtFromSlot) {
            bookingDto.scheduledAt = scheduledAtFromSlot;
            bookingDto.slotId = slotId;
          }
        }

        await this.sessionService.bookSession(bookingSessionId, bookingDto, order.buyerId.toString(), order.promoCode, session, 'confirmed');
        break;

      case TrackableContentType.PRODUCT:
        // Mark as purchased in tracking or similar
        // ProductService doesn't have a clear "purchase" yet, so we mark order as paid (already done)
        this.logger.log(`Product ${order.contentId} marked as purchased for user ${order.buyerId}`);
        break;

      case TrackableContentType.CHAPTER:
      case 'chapter':
        // Grant access to specific chapter by persisting entitlement on enrollment (idempotent).
        {
          let courseIdMeta = order.metadata?.courseId;
          if (!courseIdMeta) {
            const course = await this.coursModel
              .findOne({ 'sections.chapitres.id': order.contentId })
              .select('id _id')
              .lean();
            courseIdMeta = (course as any)?.id || (course as any)?._id?.toString?.();
          }
          if (!courseIdMeta) {
            this.logger.warn(
              `Chapter order ${order._id} has no resolvable course for chapter ${order.contentId}`,
            );
            break;
          }

          const entitlement = await this.coursService.ensureChapterPurchasedEntitlement(
            order.buyerId.toString(),
            String(courseIdMeta),
            String(order.contentId),
            session,
          );
          this.logger.log(
            `chapter_entitlement_granted orderId=${order._id} userId=${order.buyerId} courseId=${courseIdMeta} chapterId=${order.contentId} granted=${entitlement.granted}`,
          );
        }
        break;

      default:
        this.logger.warn(`Access granting not implemented for content type: ${order.contentType}`);
    }
  }

  @Get('stripe-link/verify')
  @ApiOperation({ summary: 'Verify Stripe Link payment' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async verifyStripeLink(@Query('sessionId') sessionId: string) {
    const normalizedSessionId = String(sessionId || '').trim();
    if (!normalizedSessionId) {
      throw new BadRequestException('Missing Stripe session id');
    }
    if (this.isStripeSessionPlaceholder(normalizedSessionId)) {
      throw new BadRequestException('Invalid Stripe session id placeholder');
    }

    const verify = await this.stripe.verifyLinkPayment(normalizedSessionId);
    if (!verify.success) throw new BadRequestException(verify.error);

    // Find the order by session ID
    let order: any = await this.orderModel.findOne({ paymentId: normalizedSessionId });
    if (!order) throw new BadRequestException('Order not found');

    if (verify.status === 'paid' || verify.status === 'succeeded' || verify.status === 'complete') {
      let requiresBookingAction = false;
      let didCompleteFulfillment = false;
      let sessionContentId = order.metadata?.contentId || verify.sessionMetadata?.contentId || order.contentId;
      const isChapterOrder =
        order.contentType === TrackableContentType.CHAPTER ||
        (order.contentType as any) === 'chapter';
      const chapterId = isChapterOrder ? String(order.contentId) : undefined;
      const chapterCourseId = isChapterOrder
        ? String(order.metadata?.courseId || verify.sessionMetadata?.courseId || '')
        : undefined;

      await this.runWithOptionalTransaction(async (session) => {
        const claim = await this.paymentFulfillmentService.claimForProcessing(
          order._id.toString(),
          verify.paymentMethod?.type || 'stripe-link',
          session,
        );
        if (!claim.order) {
          throw new BadRequestException('Order not found');
        }

        order = claim.order;
        sessionContentId = order.metadata?.contentId || verify.sessionMetadata?.contentId || order.contentId;

        if (claim.state === 'requires_booking') {
          requiresBookingAction = true;
          return;
        }

        if (claim.state !== 'claimed') {
          return;
        }

        try {
          await this.grantAccess(order, session, verify.sessionMetadata);
          order = await this.paymentFulfillmentService.markCompleted(order, session);
          didCompleteFulfillment = true;
        } catch (error: any) {
          if (order.contentType === TrackableContentType.SESSION && this.isMissingScheduledAtError(error)) {
            requiresBookingAction = true;
            order = await this.paymentFulfillmentService.markRequiresBooking(order, session, {
              contentId: sessionContentId,
            });
            return;
          }

          await this.paymentFulfillmentService.markFailed(order, error, session);
          throw error;
        }
      });

      if (didCompleteFulfillment) {
        await this.incrementProductSalesFromOrder(order);
        await this.affiliateCommissionService.onOrderPaid(order).catch((e) => this.logger.error(`Affiliate onOrderPaid failed: ${e?.message}`));
      }

      const refreshedOrder = await this.orderModel.findById(order._id);
      if (refreshedOrder) {
        order = refreshedOrder;
      }

      // Repair entitlement drift on verify path (idempotent).
      if (isChapterOrder && chapterId) {
        try {
          const resolvedCourseId = chapterCourseId && chapterCourseId.length > 0
            ? chapterCourseId
            : String(order.metadata?.courseId || '');

          if (resolvedCourseId) {
            const entitlement = await this.coursService.ensureChapterPurchasedEntitlement(
              order.buyerId.toString(),
              resolvedCourseId,
              chapterId,
            );
            this.logger.log(
              `chapter_verify_repair orderId=${order._id} userId=${order.buyerId} courseId=${resolvedCourseId} chapterId=${chapterId} granted=${entitlement.granted}`,
            );
          }
        } catch (repairError: any) {
          this.logger.warn(
            `chapter_verify_repair_failed orderId=${order._id} chapterId=${chapterId} error=${repairError?.message || repairError}`,
          );
        }
      }

      if (order.contentType === TrackableContentType.SESSION) {
        const metadataBookingDto = this.parseBookingDto(order.metadata?.bookingDto);
        const hasBookingDate = Boolean(metadataBookingDto?.scheduledAt);
        const hasPendingFlag = order.metadata?.fulfillmentStatus === 'requires_booking';

        let hasExistingBooking = false;
        const sessionDoc = await this.findSessionByAnyId(sessionContentId);
        if (sessionDoc) {
          hasExistingBooking = (sessionDoc.bookings || []).some(
            (b: any) => b?.userId?.toString() === order.buyerId?.toString() && b?.status !== 'cancelled',
          );
        }

        if (hasPendingFlag || (!hasExistingBooking && !hasBookingDate)) {
          requiresBookingAction = true;
          order = await this.paymentFulfillmentService.markRequiresBooking(order, null, {
            contentId: sessionContentId,
          });
        }
      }

      if (requiresBookingAction) {
        return {
          status: 'paid_action_required',
          action: 'choose_session_slot',
          message: 'Payment received. Please choose a session slot to finalize your booking.',
          orderId: order._id,
          sessionContentId,
          paymentMethod: verify.paymentMethod,
          customerId: verify.customerId,
          ...(isChapterOrder ? { chapterId, courseId: chapterCourseId || order.metadata?.courseId } : {}),
          ...(await this.enrichOrderDetails(order)),
        };
      }

      return {
        status: 'paid',
        paymentMethod: verify.paymentMethod,
        customerId: verify.customerId,
        orderId: order._id,
        ...(isChapterOrder ? { chapterId, courseId: chapterCourseId || order.metadata?.courseId } : {}),
        ...(await this.enrichOrderDetails(order))
      };
    }

    order.status = 'pending';
    await order.save();
    return { status: verify.status };
  }

  @Post('session/finalize-booking')
  @ApiOperation({ summary: 'Finalize booking for a paid session order' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async finalizeSessionBooking(
    @Req() req: any,
    @Body('orderId') orderId: string,
    @Body('scheduledAt') scheduledAt?: string,
    @Body('notes') notes?: string,
    @Body('slotId') slotId?: string,
  ) {
    const userId = (req.user?._id || req.user?.sub || '').toString();
    if (!orderId) throw new BadRequestException('orderId is required');

    let order: any = await this.orderModel.findById(orderId);
    if (!order) throw new BadRequestException('Order not found');
    if (order.buyerId?.toString() !== userId) {
      throw new ForbiddenException('You are not allowed to finalize this booking');
    }
    if (order.contentType !== TrackableContentType.SESSION) {
      throw new BadRequestException('Order is not a session payment');
    }
    if (order.status !== 'paid') {
      throw new BadRequestException('Order must be paid before finalizing booking');
    }
    if (order.creatorId?.toString() === userId) {
      throw new BadRequestException('Vous ne pouvez pas réserver votre propre session');
    }

    const bookingSessionId = order.metadata?.contentId || order.contentId;
    const resolvedFromSlot = !scheduledAt && slotId
      ? await this.resolveScheduledAtFromSlot(bookingSessionId, slotId)
      : undefined;
    const finalScheduledAt = scheduledAt || resolvedFromSlot;

    if (!finalScheduledAt) {
      throw new BadRequestException('La date de la session est obligatoire');
    }

    const scheduledDate = new Date(finalScheduledAt);
    if (Number.isNaN(scheduledDate.getTime())) {
      throw new BadRequestException('Date de session invalide');
    }

    const sessionDoc = await this.findSessionByAnyId(bookingSessionId);
    if (!sessionDoc) throw new BadRequestException('Session non trouvée');

    const existingBooking = (sessionDoc.bookings || []).find((booking: any) =>
      booking?.userId?.toString() === userId &&
      booking?.status !== 'cancelled' &&
      booking?.scheduledAt &&
      new Date(booking.scheduledAt).getTime() === scheduledDate.getTime(),
    );

    if (!existingBooking) {
      await this.sessionService.bookSession(
        bookingSessionId,
        { scheduledAt: finalScheduledAt, notes } as any,
        userId,
        order.promoCode || undefined,
        null,
        'confirmed',
      );
    }

    const nextMetadata: Record<string, any> = { ...(order.metadata || {}) };
    nextMetadata.contentId = bookingSessionId;
    nextMetadata.slotId = slotId || nextMetadata.slotId;
    nextMetadata.bookingDto = {
      ...(this.parseBookingDto(nextMetadata.bookingDto)),
      scheduledAt: finalScheduledAt,
      notes: notes || this.parseBookingDto(nextMetadata.bookingDto)?.notes,
      slotId: slotId || this.parseBookingDto(nextMetadata.bookingDto)?.slotId,
    };
    nextMetadata.finalizedAt = new Date().toISOString();
    order = await this.paymentFulfillmentService.markCompleted(order, null, nextMetadata);

    return {
      status: 'paid',
      bookingFinalized: true,
      existingBooking: Boolean(existingBooking),
      orderId: order._id,
      sessionContentId: bookingSessionId,
      scheduledAt: finalScheduledAt,
    };
  }

  @Post('stripe-link/webhook')
  @ApiOperation({ summary: 'Stripe Link webhook handler' })
  async stripeLinkWebhook(@Req() req: any) {
    const signature = req.headers['stripe-signature'] as string;
    if (!signature) {
      await this.auditPaymentEvent({
        eventType: 'webhook_rejected',
        provider: 'stripe',
        reason: 'missing_signature',
      });
      throw new UnauthorizedException('Missing Stripe signature');
    }

    const event = await this.stripe.createWebhookEvent(req.body, signature);
    if (!event.success) {
      await this.auditPaymentEvent({
        eventType: 'webhook_rejected',
        provider: 'stripe',
        reason: 'invalid_signature',
        error: event.error,
      });
      throw new UnauthorizedException(event.error);
    }

    const stripeEvent = event.event!;
    this.logger.log(`Received Stripe webhook event: ${stripeEvent.type}`);
    await this.auditPaymentEvent({
      eventType: 'webhook_received',
      provider: 'stripe',
      eventId: stripeEvent.id,
      metadata: {
        webhookType: stripeEvent.type,
      },
    });

    if (await this.hasProcessedWebhookEvent('stripe', stripeEvent.id)) {
      this.logger.log(`Ignoring duplicate Stripe webhook event ${stripeEvent.id}`);
      await this.auditPaymentEvent({
        eventType: 'duplicate_event_ignored',
        provider: 'stripe',
        eventId: stripeEvent.id,
        reason: 'already_processed',
        metadata: {
          webhookType: stripeEvent.type,
        },
      });
      return { received: true, duplicate: true };
    }

    // Handle different event types
    switch (stripeEvent.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        const stripeSession = stripeEvent.data.object as any;
        if (stripeSession.payment_status === 'paid') {
          // Process successful payment
          let order: any = await this.orderModel.findOne({ paymentId: stripeSession.id });
          if (order) {
            let didCompleteFulfillment = false;
            await this.runWithOptionalTransaction(async (dbSession) => {
              const claim = await this.paymentFulfillmentService.claimForProcessing(
                order._id.toString(),
                'stripe',
                dbSession,
              );
              if (!claim.order) {
                return;
              }

              order = claim.order;
              if (claim.state !== 'claimed') {
                return;
              }

              try {
                await this.grantAccess(order, dbSession, stripeSession.metadata);
                order = await this.paymentFulfillmentService.markCompleted(order, dbSession);
                didCompleteFulfillment = true;
              } catch (error: any) {
                if (order.contentType === TrackableContentType.SESSION && this.isMissingScheduledAtError(error)) {
                  order = await this.paymentFulfillmentService.markRequiresBooking(order, dbSession, {
                    contentId: order.metadata?.contentId || stripeSession?.metadata?.contentId || order.contentId,
                  });
                  return;
                }

                await this.paymentFulfillmentService.markFailed(order, error, dbSession);
                throw error;
              }
            });

            if (didCompleteFulfillment) {
              await this.incrementProductSalesFromOrder(order);
              await this.affiliateCommissionService.onOrderPaid(order).catch((e) => this.logger.error(`Affiliate onOrderPaid failed: ${e?.message}`));
            }
          }
        }
        break;

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        // These are handled by subscriptionService.handleWebhook if configured
        break;
    }

    await this.markWebhookEventProcessed('stripe', stripeEvent.id, stripeEvent.type);

    return { received: true };
  }

  @Post('stripe-link/customer-portal')
  @ApiOperation({ summary: 'Create Stripe customer portal session' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async createCustomerPortalSession(@Req() req: any) {
    const userId = (req.user?._id || req.user?.sub || '').toString();

    // Get user's Stripe customer ID from their subscription
    const subscription = await this.subscriptionService.getMySubscription(userId);
    if (!subscription?.providerCustomerId) {
      throw new BadRequestException('No Stripe customer found');
    }

    const returnUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard`;
    const portal = await this.stripe.createCustomerPortalSession(
      subscription.providerCustomerId,
      returnUrl
    );

    if (!portal.success) throw new BadRequestException(portal.error);

    return { portalUrl: portal.url };
  }

  @Post('stripe-link/init/chapter')
  @ApiOperation({ summary: 'Initiate Stripe Link payment for a single chapter' })
  @ApiQuery({ name: 'promoCode', required: false })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async initStripeLinkChapterPayment(
    @Body('courseId') courseId: string,
    @Body('chapterId') chapterId: string,
    @Req() req: any,
    @Body('channel') channelRaw?: string,
    @Body('successRedirectUrl') successRedirectUrl?: string,
    @Body('cancelRedirectUrl') cancelRedirectUrl?: string,
    @Body('clientContext') clientContextRaw?: Record<string, any>,
    @Query('promoCode') promoCode?: string,
  ) {
    const userId = (req.user?._id || req.user?.sub || '').toString();
    const channel = this.normalizePaymentChannel(channelRaw);
    const clientContext = this.normalizeClientContext(clientContextRaw);
    
    // 1. Find Course
    let cours: CoursDocument | null = null;
    if (Types.ObjectId.isValid(courseId)) {
      cours = await this.coursModel.findById(courseId);
    }
    if (!cours) {
      cours = await this.coursModel.findOne({ id: courseId });
    }
    if (!cours) throw new BadRequestException('Course not found');
    
    // 2. Find Chapter & Price
    let targetChapter: any = null;
    cours.sections.forEach(section => {
      const found = section.chapitres.find(c => c.id === chapterId);
      if (found) targetChapter = found;
    });

    if (!targetChapter) throw new BadRequestException('Chapter not found in this course');
    
    // Check if it's actually a paid chapter
    if (!targetChapter.isPaidChapter) {
        throw new BadRequestException('This chapter is not marked as a paid chapter');
    }

    const price = targetChapter.prix || 0;
    if (price <= 0) throw new BadRequestException('Free chapter (invalid price)');

    const currency = ((cours as any)?.devise || 'TND').toString();

    // 3. Calculate Amount & Discounts
    let amount = price;
    let discountDT = 0;
    let appliedCode: string | undefined;
    
    if (promoCode) {
      const buyer = await this.userModel.findById(userId).select('email');
      // Using 'chapter' as content type for promo validation might require updating PromoService, 
      // or we can treat it as a product/course. For now, assuming 'chapter' logic or fallback.
      // We'll pass 'chapter' as string which might need TrackableContentType enum update.
      // Casting to any to bypass enum strictness if needed for now.
      const promo = await this.promoService.validateAndApply(
        promoCode,
        price,
        TrackableContentType.CHAPTER,
        chapterId,
        (buyer as any)?.email,
      );
      if (promo.valid) {
        amount = promo.finalAmountDT;
        discountDT = promo.discountDT;
        appliedCode = promo.appliedCode;
      }
    }

    // 4. Create Pending Order
    const breakdown = await this.feeService.calculateForAmount(amount, cours.creatorId.toString());
    const pendingOrder = await this.orderModel.create({
      buyerId: new Types.ObjectId(userId),
      creatorId: cours.creatorId,
      contentType: TrackableContentType.CHAPTER,
      contentId: chapterId,   // Storing chapter ID as the main content ID
      amountDT: breakdown.amountDT,
      platformPercent: breakdown.platformPercent,
      platformFixedDT: breakdown.platformFixedDT,
      platformFeeDT: breakdown.platformFeeDT,
      creatorNetDT: breakdown.creatorNetDT,
      promoCode: appliedCode,
      discountDT,
      status: 'pending',
      metadata: this.buildPendingFulfillmentMetadata({
        courseId: cours.id || cours._id.toString(), // Store course ID in metadata for access granting
        chapterTitle: targetChapter.titre,
        channel,
        ...(Object.keys(clientContext).length > 0 ? { clientContext } : {}),
        ...this.resolveAffiliateAttribution(req),
      })
    });

    // 5. Create Stripe Session
    const coursePublicId = cours.id || cours._id.toString();
    const defaultSuccessUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-success?scope=chapter&id=${chapterId}&courseId=${coursePublicId}&provider=stripe&sessionId={CHECKOUT_SESSION_ID}`;
    const defaultFailUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-failed?scope=chapter&id=${chapterId}&courseId=${coursePublicId}&provider=stripe`;
    const successUrl = this.resolveCheckoutRedirectUrl(defaultSuccessUrl, successRedirectUrl);
    const failUrl = this.resolveCheckoutRedirectUrl(defaultFailUrl, cancelRedirectUrl);

    const user = await this.userModel.findById(userId).select('email name');
    const session = await this.stripe.createLinkCheckoutSession({
      amountDT: amount,
      currency: currency.toLowerCase(),
      successUrl,
      cancelUrl: failUrl,
      customerEmail: user?.email,
      metadata: {
        userId,
        contentType: TrackableContentType.CHAPTER,
        contentId: chapterId,
        courseId: coursePublicId,
        orderId: pendingOrder._id.toString(),
        channel,
        ...(Object.keys(clientContext).length > 0 ? { clientContext: JSON.stringify(clientContext) } : {}),
      },
      lineItems: [{
        name: `${targetChapter.titre} (Chapter)`,
        description: `Access to single chapter in ${cours.titre}`,
        amount: amount,
        quantity: 1
      }]
    });

    if (!session.success) throw new BadRequestException(session.error);

    pendingOrder.paymentId = session.sessionId;
    await pendingOrder.save();

    return this.buildStripeInitResponse({
      scope: 'chapter',
      targetId: chapterId,
      orderId: pendingOrder._id.toString(),
      sessionId: session.sessionId,
      checkoutUrl: session.url,
      extra: {
        amount,
        currency,
        chapterId,
        courseId: coursePublicId,
        channel,
      },
    });
  }

  // ==================== MANUAL PAYMENT ENDPOINTS ====================

  @Post('manual/init/community')
  @ApiOperation({ summary: 'Initiate manual payment (transfer) for community membership' })
  @ApiQuery({ name: 'promoCode', required: false })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('proof', { storage: manualProofStorage }))
  async initManualCommunityPayment(
    @Body('communityId') communityId: string,
    @Body('inviteCode') inviteCode: string | undefined,
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Query('promoCode') promoCode?: string,
  ) {
    if (!file) throw new BadRequestException('Payment proof file is required');

    const userId = (req.user?._id || req.user?.sub || '').toString();
    const community = await this.communityModel.findById(communityId);
    if (!community) throw new BadRequestException('Community not found');
    const validatedInviteCode = await this.assertPrivateInviteAccess(community, inviteCode);

    const price = community.fees_of_join || 0;
    if (price <= 0) throw new BadRequestException('Free community');

    let amount = price;
    let discountDT = 0;
    let appliedCode: string | undefined;

    if (promoCode) {
      const buyer = await this.userModel.findById(userId).select('email');
      const promo = await this.promoService.validateAndApply(promoCode, price, TrackableContentType.COMMUNITY, community._id.toString(), (buyer as any)?.email);
      if (promo.valid) {
        amount = promo.finalAmountDT;
        discountDT = promo.discountDT;
        appliedCode = promo.appliedCode;
      }
    }

    const breakdown = await this.feeService.calculateForAmount(amount, community.createur.toString());
    // Use the filename already assigned by Multer to avoid URL/file mismatch
    const uploadResult = await this.uploadService.processUploadedFile(file, file.filename, {
      userId,
      purpose: MediaPurpose.MANUAL_PAYMENT_PROOF,
      entityType: TrackableContentType.COMMUNITY,
      entityId: community._id.toString(),
    });

    const order = await this.orderModel.create({
      buyerId: new Types.ObjectId(userId),
      creatorId: community.createur,
      communityId: community._id,
      contentType: TrackableContentType.COMMUNITY,
      contentId: community._id.toString(),
      amountDT: breakdown.amountDT,
      platformPercent: breakdown.platformPercent,
      platformFixedDT: breakdown.platformFixedDT,
      platformFeeDT: breakdown.platformFeeDT,
      creatorNetDT: breakdown.creatorNetDT,
      promoCode: appliedCode,
      discountDT,
      status: 'pending_verification',
      paymentMethod: 'manual',
      paymentProof: uploadResult.url,
      metadata: {
        ...(validatedInviteCode ? { inviteCode: validatedInviteCode } : {}),
      },
    });

    return {
      success: true,
      message: 'Payment submitted for verification',
      orderId: order._id
    };
  }

  @Post('manual/init/course')
  @ApiOperation({ summary: 'Initiate manual payment (transfer) for course' })
  @ApiQuery({ name: 'promoCode', required: false })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('proof', { storage: manualProofStorage }))
  async initManualCoursePayment(
    @Body('courseId') courseId: string,
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Query('promoCode') promoCode?: string,
  ) {
    if (!file) throw new BadRequestException('Payment proof file is required');

    const userId = (req.user?._id || req.user?.sub || '').toString();

    let cours: CoursDocument | null = null;
    if (Types.ObjectId.isValid(courseId)) {
      cours = await this.coursModel.findById(courseId);
    }
    if (!cours) {
      cours = await this.coursModel.findOne({ id: courseId });
    }
    if (!cours) throw new BadRequestException('Course not found');

    const price = cours.prix || 0;
    if (price <= 0) throw new BadRequestException('Free course');

    let amount = price;
    let discountDT = 0;
    let appliedCode: string | undefined;

    if (promoCode) {
      const buyer = await this.userModel.findById(userId).select('email');
      const promo = await this.promoService.validateAndApply(promoCode, price, TrackableContentType.COURSE, cours._id.toString(), (buyer as any)?.email);
      if (promo.valid) {
        amount = promo.finalAmountDT;
        discountDT = promo.discountDT;
        appliedCode = promo.appliedCode;
      }
    }

    const breakdown = await this.feeService.calculateForAmount(amount, cours.creatorId.toString());
    const uploadResult = await this.uploadService.processUploadedFile(file, file.filename, {
      userId,
      purpose: MediaPurpose.MANUAL_PAYMENT_PROOF,
      entityType: TrackableContentType.COURSE,
      entityId: cours._id.toString(),
    });

    const order = await this.orderModel.create({
      buyerId: new Types.ObjectId(userId),
      creatorId: cours.creatorId,
      contentType: TrackableContentType.COURSE,
      contentId: cours._id.toString(),
      amountDT: breakdown.amountDT,
      platformPercent: breakdown.platformPercent,
      platformFixedDT: breakdown.platformFixedDT,
      platformFeeDT: breakdown.platformFeeDT,
      creatorNetDT: breakdown.creatorNetDT,
      promoCode: appliedCode,
      discountDT,
      status: 'pending_verification',
      paymentMethod: 'manual',
      paymentProof: uploadResult.url
    });

    return {
      success: true,
      message: 'Payment submitted for verification',
      orderId: order._id
    };
  }

  @Post('manual/init/challenge')
  @ApiOperation({ summary: 'Initiate manual payment (transfer) for challenge' })
  @ApiQuery({ name: 'promoCode', required: false })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('proof', { storage: manualProofStorage }))
  async initManualChallengePayment(
    @Body('challengeId') challengeId: string,
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Query('promoCode') promoCode?: string,
  ) {
    const userId = (req.user?._id || req.user?.sub || '').toString();

    console.log('[Challenge Payment] Received challengeId:', challengeId);
    console.log('[Challenge Payment] Body:', req.body);

    if (!challengeId) {
      throw new BadRequestException('Challenge ID is required');
    }

    // Try to find challenge by ObjectId first, then by id field
    let challenge: ChallengeDocument | null = null;
    if (Types.ObjectId.isValid(challengeId)) {
      challenge = await this.challengeModel.findById(challengeId);
    }
    if (!challenge) {
      challenge = await this.challengeModel.findOne({ id: challengeId });
    }
    if (!challenge) {
      console.log('[Challenge Payment] Challenge not found with ID:', challengeId);
      throw new BadRequestException('Challenge not found');
    }

    // Get the deposit amount from various possible locations
    const price = challenge.depositAmount || challenge.pricing?.depositAmount || challenge.pricing?.participationFee || challenge.pricing?.price || (challenge as any).prix || 0;

    console.log('[Challenge Payment] Challenge found:', challenge.title, 'Price:', price);

    // For free challenges, just add the user as a participant
    if (price <= 0) {
      // Check if already participating
      const isParticipating = challenge.participants?.some(p => p.userId?.toString() === userId);
      if (isParticipating) {
        throw new BadRequestException('You are already participating in this challenge');
      }

      // Add participant using the challenge method
      challenge.addParticipant(new Types.ObjectId(userId));
      await challenge.save();

      console.log('[Challenge Payment] User joined free challenge successfully');
      return { success: true, message: 'Successfully joined the free challenge!' };
    }

    // For paid challenges, require payment proof
    if (!file) throw new BadRequestException('Payment proof file is required for paid challenges');

    const existing = await this.orderModel.findOne({
      buyerId: new Types.ObjectId(userId),
      creatorId: challenge.creatorId,
      paymentMethod: 'manual',
      contentType: TrackableContentType.CHALLENGE,
      contentId: challenge._id.toString(),
      status: { $in: ['pending_verification', 'paid'] },
    }).select('_id status').exec();

    if (existing) {
      throw new BadRequestException('You already submitted a payment proof for this challenge. Please wait for verification.');
    }

    let amount = price;
    let discountDT = 0;
    let appliedCode: string | undefined;

    if (promoCode) {
      const buyer = await this.userModel.findById(userId).select('email');
      const promo = await this.promoService.validateAndApply(promoCode, price, TrackableContentType.CHALLENGE, challenge._id.toString(), (buyer as any)?.email);
      if (promo.valid) {
        amount = promo.finalAmountDT;
        discountDT = promo.discountDT;
        appliedCode = promo.appliedCode;
      }
    }

    const breakdown = await this.feeService.calculateForAmount(amount, challenge.creatorId.toString());
    const uploadResult = await this.uploadService.processUploadedFile(file, file.filename, {
      userId,
      purpose: MediaPurpose.MANUAL_PAYMENT_PROOF,
      entityType: TrackableContentType.CHALLENGE,
      entityId: challenge._id.toString(),
    });

    const order = await this.orderModel.create({
      buyerId: new Types.ObjectId(userId),
      creatorId: challenge.creatorId,
      contentType: TrackableContentType.CHALLENGE,
      contentId: challenge._id.toString(),
      amountDT: breakdown.amountDT,
      platformPercent: breakdown.platformPercent,
      platformFixedDT: breakdown.platformFixedDT,
      platformFeeDT: breakdown.platformFeeDT,
      creatorNetDT: breakdown.creatorNetDT,
      promoCode: appliedCode,
      discountDT,
      status: 'pending_verification',
      paymentMethod: 'manual',
      paymentProof: uploadResult.url
    });

    console.log('[Challenge Payment] Payment proof submitted, order ID:', order._id);
    return { success: true, message: 'Payment proof submitted successfully. Please wait for creator verification.', orderId: order._id };
  }

  @Post('manual/init/event')
  @ApiOperation({ summary: 'Initiate manual payment (transfer) for event' })
  @ApiQuery({ name: 'promoCode', required: false })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('proof', { storage: manualProofStorage }))
  async initManualEventPayment(
    @Body('eventId') eventId: string,
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Query('promoCode') promoCode?: string,
  ) {
    if (!file) throw new BadRequestException('Payment proof file is required');
    const userId = (req.user?._id || req.user?.sub || '').toString();
    const event = await this.eventModel.findById(eventId);
    if (!event) throw new BadRequestException('Event not found');

    const existing = await this.orderModel.findOne({
      buyerId: new Types.ObjectId(userId),
      creatorId: event.creatorId,
      paymentMethod: 'manual',
      contentType: TrackableContentType.EVENT,
      contentId: event._id.toString(),
      status: { $in: ['pending_verification', 'paid'] },
    }).select('_id status').exec();

    if (existing) {
      throw new BadRequestException('You already submitted a payment proof for this request. Please wait for verification.');
    }

    const price = event.pricing?.price || (event as any).prix || 0;
    if (price <= 0) throw new BadRequestException('Free event');

    let amount = price;
    let discountDT = 0;
    let appliedCode: string | undefined;

    if (promoCode) {
      const buyer = await this.userModel.findById(userId).select('email');
      const promo = await this.promoService.validateAndApply(promoCode, price, TrackableContentType.EVENT, event._id.toString(), (buyer as any)?.email);
      if (promo.valid) {
        amount = promo.finalAmountDT;
        discountDT = promo.discountDT;
        appliedCode = promo.appliedCode;
      }
    }

    const breakdown = await this.feeService.calculateForAmount(amount, event.creatorId.toString());
    const uploadResult = await this.uploadService.processUploadedFile(file, file.filename, {
      userId,
      purpose: MediaPurpose.MANUAL_PAYMENT_PROOF,
      entityType: TrackableContentType.EVENT,
      entityId: event._id.toString(),
    });

    const order = await this.orderModel.create({
      buyerId: new Types.ObjectId(userId),
      creatorId: event.creatorId,
      contentType: TrackableContentType.EVENT,
      contentId: event._id.toString(),
      amountDT: breakdown.amountDT,
      platformPercent: breakdown.platformPercent,
      platformFixedDT: breakdown.platformFixedDT,
      platformFeeDT: breakdown.platformFeeDT,
      creatorNetDT: breakdown.creatorNetDT,
      promoCode: appliedCode,
      discountDT,
      status: 'pending_verification',
      paymentMethod: 'manual',
      paymentProof: uploadResult.url
    });

    return { success: true, message: 'Payment submitted for verification', orderId: order._id };
  }

  @Post('manual/init/product')
  @ApiOperation({ summary: 'Initiate manual payment (transfer) for product' })
  @ApiQuery({ name: 'promoCode', required: false })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('proof', { storage: manualProofStorage }))
  async initManualProductPayment(
    @Body('productId') productId: string,
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Query('promoCode') promoCode?: string,
  ) {
    if (!file) throw new BadRequestException('Payment proof file is required');
    const userId = (req.user?._id || req.user?.sub || '').toString();
    // Accept both Mongo _id and custom product.id
    let product = await this.productModel.findById(productId);
    if (!product) {
      product = await this.productModel.findOne({ id: productId });
    }
    if (!product) throw new BadRequestException('Product not found');
    const buyerFilter = this.buildBuyerIdFilter(userId);
    const productIdCandidates = this.buildProductContentIdCandidates(product);
    const existingPaidOrder = await this.findExistingPaidProductOrder(userId, product);
    if (existingPaidOrder) {
      throw new BadRequestException('Product already purchased. You already have lifetime access.');
    }

    const existing = await this.orderModel.findOne({
      buyerId: buyerFilter,
      contentType: TrackableContentType.PRODUCT,
      contentId: { $in: productIdCandidates },
      status: { $in: ['pending_verification', 'pending'] },
    }).select('_id status').exec();

    if (existing) {
      throw new BadRequestException('You already submitted a payment proof for this request. Please wait for verification.');
    }

    const price = product.price || product.pricing?.price || 0;
    if (price <= 0) throw new BadRequestException('Free product');

    let amount = price;
    let discountDT = 0;
    let appliedCode: string | undefined;

    if (promoCode) {
      const buyer = await this.userModel.findById(userId).select('email');
      const promo = await this.promoService.validateAndApply(promoCode, price, TrackableContentType.PRODUCT, product._id.toString(), (buyer as any)?.email);
      if (promo.valid) {
        amount = promo.finalAmountDT;
        discountDT = promo.discountDT;
        appliedCode = promo.appliedCode;
      }
    }

    const breakdown = await this.feeService.calculateForAmount(amount, product.creatorId.toString());
    const uploadResult = await this.uploadService.processUploadedFile(file, file.filename, {
      userId,
      purpose: MediaPurpose.MANUAL_PAYMENT_PROOF,
      entityType: TrackableContentType.PRODUCT,
      entityId: product._id.toString(),
    });

    const order = await this.orderModel.create({
      buyerId: new Types.ObjectId(userId),
      creatorId: product.creatorId,
      contentType: TrackableContentType.PRODUCT,
      contentId: product._id.toString(),
      amountDT: breakdown.amountDT,
      platformPercent: breakdown.platformPercent,
      platformFixedDT: breakdown.platformFixedDT,
      platformFeeDT: breakdown.platformFeeDT,
      creatorNetDT: breakdown.creatorNetDT,
      promoCode: appliedCode,
      discountDT,
      status: 'pending_verification',
      paymentMethod: 'manual',
      paymentProof: uploadResult.url
    });

    return { success: true, message: 'Payment submitted for verification', orderId: order._id };
  }

  @Post('manual/init/session')
  @ApiOperation({ summary: 'Initiate manual payment (transfer) for session' })
  @ApiQuery({ name: 'promoCode', required: false })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('proof', { storage: manualProofStorage }))
  async initManualSessionPayment(
    @Body('sessionId') sessionId: string,
    @Body('slotId') slotId: string,
    @Body('notes') notes: string,
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Query('promoCode') promoCode?: string,
  ) {
    if (!file) throw new BadRequestException('Payment proof file is required');
    const userId = (req.user?._id || req.user?.sub || '').toString();

    // Find session by custom id field first, then by _id
    let session = await this.sessionModel.findOne({ id: sessionId });
    if (!session) {
      session = await this.sessionModel.findById(sessionId);
    }
    if (!session) throw new BadRequestException('Session not found');

    const existing = await this.orderModel.findOne({
      buyerId: new Types.ObjectId(userId),
      creatorId: session.creatorId,
      paymentMethod: 'manual',
      contentType: TrackableContentType.SESSION,
      contentId: session._id.toString(),
      status: { $in: ['pending_verification', 'paid'] },
    }).select('_id status').exec();

    if (existing) {
      throw new BadRequestException('You already submitted a payment proof for this request. Please wait for verification.');
    }

    const price = session.price || session.pricing?.price || 0;
    if (price <= 0) throw new BadRequestException('Free session');

    let amount = price;
    let discountDT = 0;
    let appliedCode: string | undefined;

    if (promoCode) {
      const buyer = await this.userModel.findById(userId).select('email');
      const promo = await this.promoService.validateAndApply(promoCode, price, TrackableContentType.SESSION, session._id.toString(), (buyer as any)?.email);
      if (promo.valid) {
        amount = promo.finalAmountDT;
        discountDT = promo.discountDT;
        appliedCode = promo.appliedCode;
      }
    }

    const breakdown = await this.feeService.calculateForAmount(amount, session.creatorId.toString());
    const uploadResult = await this.uploadService.processUploadedFile(file, file.filename, {
      userId,
      purpose: MediaPurpose.MANUAL_PAYMENT_PROOF,
      entityType: TrackableContentType.SESSION,
      entityId: session._id.toString(),
    });

    // If slotId is provided, reserve the slot (mark as pending)
    let slotInfo: any = null;
    if (slotId && session.availableSlots) {
      const slot = session.availableSlots.find(s => s.id === slotId);
      if (slot && slot.isAvailable) {
        slot.isAvailable = false;
        slot.bookedBy = new Types.ObjectId(userId);
        slot.bookedAt = new Date();
        slotInfo = {
          slotId: slot.id,
          startTime: slot.startTime,
          endTime: slot.endTime,
        };
        await session.save();
      }
    }

    const order = await this.orderModel.create({
      buyerId: new Types.ObjectId(userId),
      creatorId: session.creatorId,
      contentType: TrackableContentType.SESSION,
      contentId: session._id.toString(),
      amountDT: breakdown.amountDT,
      platformPercent: breakdown.platformPercent,
      platformFixedDT: breakdown.platformFixedDT,
      platformFeeDT: breakdown.platformFeeDT,
      creatorNetDT: breakdown.creatorNetDT,
      promoCode: appliedCode,
      discountDT,
      status: 'pending_verification',
      paymentMethod: 'manual',
      paymentProof: uploadResult.url,
      metadata: slotInfo ? { slotId: slotInfo.slotId, slotStartTime: slotInfo.startTime, slotEndTime: slotInfo.endTime, notes } : { notes }
    });

    return {
      success: true,
      message: 'Payment submitted for verification. The slot has been reserved.',
      orderId: order._id,
      slot: slotInfo
    };
  }

  @Get('manual/pending')
  @ApiOperation({ summary: 'Get pending manual payments for the logged-in creator' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getPendingManualPayments(@Req() req: any) {
    const userId = (req.user?._id || req.user?.sub || '').toString();
    const payments = await this.manualPaymentService.getPendingPaymentsForCreator(userId);
    const enriched = await this.enrichManualOrdersForDashboard(payments as any);
    return { success: true, data: enriched };
  }

  @Get('manual/history')
  @ApiOperation({ summary: 'Get manual payment proofs history for the logged-in creator' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by order status (or "all")' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (1-based)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Page size (max 100)' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getManualPaymentsHistory(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const userId = (req.user?._id || req.user?.sub || '').toString();
    const result = await this.manualPaymentService.getManualPaymentsHistoryForCreator(userId, {
      status,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    const enriched = await this.enrichManualOrdersForDashboard(result.items as any);
    return { success: true, data: enriched, meta: result.meta };
  }

  @Post('manual/verify/:orderId')
  @ApiOperation({ summary: 'Verify (approve or reject) a manual payment' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async verifyManualPayment(
    @Param('orderId') orderId: string,
    @Body('action') action: 'approve' | 'reject',
    @Req() req: any
  ) {
    const userId = (req.user?._id || req.user?.sub || '').toString();
    if (!['approve', 'reject'].includes(action)) {
      throw new BadRequestException('Invalid action. Must be "approve" or "reject"');
    }

    try {
      const creatorFilter: any = Types.ObjectId.isValid(userId)
        ? new Types.ObjectId(userId)
        : userId;
      const pendingOrder = await this.orderModel.findOne({
        _id: orderId,
        paymentMethod: 'manual',
        status: 'pending_verification',
        creatorId: creatorFilter,
      });
      if (!pendingOrder) {
        throw new BadRequestException('Order not found or access denied');
      }

      if (action === 'approve' && pendingOrder.contentType === TrackableContentType.COMMUNITY) {
        const privateCommunity = await this.communityModel.findById(pendingOrder.contentId);
        if (!privateCommunity) {
          throw new BadRequestException('Community not found');
        }
        await this.assertPrivateInviteAccess(
          privateCommunity,
          (pendingOrder as any)?.metadata?.inviteCode,
        );
      }

      const order = await this.manualPaymentService.verifyPayment(orderId, userId, action);
      await this.auditPaymentEvent({
        orderId: order._id?.toString?.(),
        eventType: action === 'approve' ? 'manual_verification_completed' : 'manual_verification_rejected',
        provider: 'manual',
        paymentMethod: 'manual',
        previousStatus: 'pending_verification',
        nextStatus: order.status,
      });

      const buyer = await this.userModel.findById(order.buyerId).select('email name').exec();

      // If approved, trigger content access granting logic if needed
      if (action === 'approve') {
        let didCompleteFulfillment = false;
        let fulfilledOrder: any = order;
        await this.runWithOptionalTransaction(async (dbSession) => {
          const claim = await this.paymentFulfillmentService.claimForProcessing(
            order._id.toString(),
            'manual',
            dbSession,
          );
          if (!claim.order) {
            throw new BadRequestException('Order not found');
          }

          fulfilledOrder = claim.order;
          if (claim.state === 'requires_booking' || claim.state === 'completed') {
            return;
          }
          if (claim.state !== 'claimed') {
            return;
          }

          try {
            await this.grantAccess(fulfilledOrder, dbSession);
            fulfilledOrder = await this.paymentFulfillmentService.markCompleted(fulfilledOrder, dbSession);
            didCompleteFulfillment = true;
          } catch (error: any) {
            if (
              fulfilledOrder.contentType === TrackableContentType.SESSION &&
              this.isMissingScheduledAtError(error)
            ) {
              fulfilledOrder = await this.paymentFulfillmentService.markRequiresBooking(
                fulfilledOrder,
                dbSession,
                {
                  contentId: fulfilledOrder.metadata?.contentId || fulfilledOrder.contentId,
                },
              );
              return;
            }
            await this.paymentFulfillmentService.markFailed(fulfilledOrder, error, dbSession);
            throw error;
          }
        });

        order.metadata = fulfilledOrder.metadata;
        order.status = fulfilledOrder.status;

        if (didCompleteFulfillment) {
          await this.incrementProductSalesFromOrder(fulfilledOrder);
          await this.affiliateCommissionService.onOrderPaid(fulfilledOrder).catch((e) => this.logger.error(`Affiliate onOrderPaid failed: ${e?.message}`));
        }

        await this.notificationService.createNotification({
          recipient: order.buyerId.toString(),
          type: 'manual_payment_approved',
          title: 'Payment approved',
          body: 'Your manual payment proof was approved. You now have access.',
          data: {
            orderId: order._id.toString(),
            contentType: order.contentType,
            contentId: order.contentId,
          },
        });
      } else {
        if (buyer?.email) {
          const retryUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/`; // keep generic
          await this.emailService.sendGenericEmail({
            to: buyer.email,
            subject: 'Manual payment rejected',
            text: `Hello${buyer?.name ? ` ${buyer.name}` : ''},\n\nYour manual payment proof was rejected by the creator.\n\nYou can try again by submitting a new proof from the checkout flow.\n\nOrder: ${order._id.toString()}\nType: ${order.contentType}\n\nRetry: ${retryUrl}\n`,
          });
        }
      }

      return { success: true, message: `Payment ${action}ed successfully`, order };
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Failed to verify payment');
    }
  }

  // ==================== KONNECT PAYMENT ENDPOINTS ====================

  private getKonnectWebhookUrl(): string {
    const backendUrl = (process.env.BACKEND_URL || process.env.API_URL || 'https://api.chabaqa.io/api').replace(/\/+$/, '');
    return `${backendUrl}/payment/konnect/webhook`;
  }

  private buildKonnectInitResponse(params: {
    scope: string;
    targetId: string;
    orderId: string;
    paymentRef?: string;
    payUrl?: string;
  }) {
    return {
      payUrl: params.payUrl,
      paymentRef: params.paymentRef,
      orderId: params.orderId,
      provider: 'konnect',
      scope: params.scope,
      targetId: params.targetId,
    };
  }

  @Post('konnect/init/community')
  @ApiOperation({ summary: 'Initiate Konnect payment for community membership' })
  @ApiQuery({ name: 'promoCode', required: false })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async initKonnectCommunityPayment(
    @Body('communityId') communityId: string,
    @Body('inviteCode') inviteCode: string | undefined,
    @Req() req: any,
    @Query('promoCode') promoCode?: string,
  ) {
    const userId = (req.user?._id || req.user?.sub || '').toString();
    const community = await this.communityModel.findById(communityId);
    if (!community) throw new BadRequestException('Communauté non trouvée');
    const validatedInviteCode = await this.assertPrivateInviteAccess(community, inviteCode);

    const price = community.fees_of_join || 0;
    if (price <= 0) throw new BadRequestException('Communauté gratuite');

    let amount = price;
    let discountDT = 0;
    let appliedCode: string | undefined;
    if (promoCode) {
      const buyer = await this.userModel.findById(userId).select('email');
      const promo = await this.promoService.validateAndApply(promoCode, price, TrackableContentType.COMMUNITY, community._id.toString(), (buyer as any)?.email);
      if (promo.valid) {
        amount = promo.finalAmountDT;
        discountDT = promo.discountDT;
        appliedCode = promo.appliedCode;
      }
    }

    const breakdown = await this.feeService.calculateForAmount(amount, community.createur.toString());
    const metadata: Record<string, any> = { provider: 'konnect' };
    if (validatedInviteCode) metadata.inviteCode = validatedInviteCode;

    const pendingOrder = await this.orderModel.create({
      buyerId: new Types.ObjectId(userId),
      creatorId: community.createur,
      communityId: community._id,
      contentType: TrackableContentType.COMMUNITY,
      contentId: community._id.toString(),
      amountDT: breakdown.amountDT,
      platformPercent: breakdown.platformPercent,
      platformFixedDT: breakdown.platformFixedDT,
      platformFeeDT: breakdown.platformFeeDT,
      creatorNetDT: breakdown.creatorNetDT,
      promoCode: appliedCode,
      discountDT,
      status: 'pending',
      metadata: this.buildPendingFulfillmentMetadata(metadata),
    });

    const user = await this.userModel.findById(userId).select('email name firstName lastName');
    const successUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-success?scope=community&id=${communityId}&provider=konnect&paymentRef=PAYMENT_REF_PLACEHOLDER`;
    const failUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-failed?scope=community&id=${communityId}&provider=konnect`;

    const init = await this.konnect.initPayment({
      amountTND: amount,
      description: `Join ${community.name}`,
      orderId: pendingOrder._id.toString(),
      successUrl,
      failUrl,
      webhookUrl: this.getKonnectWebhookUrl(),
      firstName: (user as any)?.firstName || (user as any)?.name?.split(' ')[0] || '',
      lastName: (user as any)?.lastName || (user as any)?.name?.split(' ').slice(1).join(' ') || '',
      email: user?.email || '',
    });
    if (!init.success) throw new BadRequestException(init.error || 'Konnect payment init failed');

    pendingOrder.paymentId = init.paymentRef;
    await pendingOrder.save();

    return this.buildKonnectInitResponse({
      scope: 'community',
      targetId: communityId,
      orderId: pendingOrder._id.toString(),
      paymentRef: init.paymentRef,
      payUrl: init.payUrl,
    });
  }

  @Post('konnect/init/course')
  @ApiOperation({ summary: 'Initiate Konnect payment for course enrollment' })
  @ApiQuery({ name: 'promoCode', required: false })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async initKonnectCoursePayment(
    @Body('courseId') courseId: string,
    @Req() req: any,
    @Query('promoCode') promoCode?: string,
  ) {
    const userId = (req.user?._id || req.user?.sub || '').toString();
    let cours: CoursDocument | null = null;
    if (Types.ObjectId.isValid(courseId)) {
      cours = await this.coursModel.findById(courseId);
    }
    if (!cours) {
      cours = await this.coursModel.findOne({ id: courseId });
    }
    if (!cours) throw new BadRequestException('Cours non trouvé');
    const courseObjectId = cours._id;
    const coursePublicId = cours.id || courseObjectId.toString();
    const price = cours.prix || 0;
    if (price <= 0) throw new BadRequestException('Cours gratuit');

    let amount = price;
    let discountDT = 0;
    let appliedCode: string | undefined;
    if (promoCode) {
      const buyer = await this.userModel.findById(userId).select('email');
      const promo = await this.promoService.validateAndApply(promoCode, price, TrackableContentType.COURSE, cours._id.toString(), (buyer as any)?.email);
      if (promo.valid) { amount = promo.finalAmountDT; discountDT = promo.discountDT; appliedCode = promo.appliedCode; }
    }

    const breakdown = await this.feeService.calculateForAmount(amount, cours.creatorId.toString());
    const pendingOrder = await this.orderModel.create({
      buyerId: new Types.ObjectId(userId),
      creatorId: cours.creatorId,
      contentType: TrackableContentType.COURSE,
      contentId: courseObjectId.toString(),
      amountDT: breakdown.amountDT,
      platformPercent: breakdown.platformPercent,
      platformFixedDT: breakdown.platformFixedDT,
      platformFeeDT: breakdown.platformFeeDT,
      creatorNetDT: breakdown.creatorNetDT,
      promoCode: appliedCode,
      discountDT,
      status: 'pending',
      metadata: this.buildPendingFulfillmentMetadata({ provider: 'konnect' }),
    });

    const user = await this.userModel.findById(userId).select('email name firstName lastName');
    const successUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-success?scope=course&id=${coursePublicId}&provider=konnect&paymentRef=PAYMENT_REF_PLACEHOLDER`;
    const failUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-failed?scope=course&id=${coursePublicId}&provider=konnect`;

    const init = await this.konnect.initPayment({
      amountTND: amount,
      description: cours.titre || 'Course',
      orderId: pendingOrder._id.toString(),
      successUrl,
      failUrl,
      webhookUrl: this.getKonnectWebhookUrl(),
      firstName: (user as any)?.firstName || (user as any)?.name?.split(' ')[0] || '',
      lastName: (user as any)?.lastName || (user as any)?.name?.split(' ').slice(1).join(' ') || '',
      email: user?.email || '',
    });
    if (!init.success) throw new BadRequestException(init.error || 'Konnect payment init failed');

    pendingOrder.paymentId = init.paymentRef;
    await pendingOrder.save();

    return this.buildKonnectInitResponse({
      scope: 'course',
      targetId: coursePublicId,
      orderId: pendingOrder._id.toString(),
      paymentRef: init.paymentRef,
      payUrl: init.payUrl,
    });
  }

  @Post('konnect/init/challenge')
  @ApiOperation({ summary: 'Initiate Konnect payment for challenge participation' })
  @ApiQuery({ name: 'promoCode', required: false })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async initKonnectChallengePayment(
    @Body('challengeId') challengeId: string,
    @Req() req: any,
    @Query('promoCode') promoCode?: string,
  ) {
    const userId = (req.user?._id || req.user?.sub || '').toString();
    const challenge = await this.challengeModel.findById(challengeId);
    if (!challenge) throw new BadRequestException('Défi non trouvé');
    const price = challenge.pricing?.participationFee || 0;
    if (price <= 0) throw new BadRequestException('Défi gratuit');

    let amount = price;
    let discountDT = 0;
    let appliedCode: string | undefined;
    if (promoCode) {
      const buyer = await this.userModel.findById(userId).select('email');
      const promo = await this.promoService.validateAndApply(promoCode, price, TrackableContentType.CHALLENGE, challenge._id.toString(), (buyer as any)?.email);
      if (promo.valid) { amount = promo.finalAmountDT; discountDT = promo.discountDT; appliedCode = promo.appliedCode; }
    }

    const breakdown = await this.feeService.calculateForAmount(amount, challenge.creatorId.toString());
    const pendingOrder = await this.orderModel.create({
      buyerId: new Types.ObjectId(userId),
      creatorId: challenge.creatorId,
      contentType: TrackableContentType.CHALLENGE,
      contentId: challenge._id.toString(),
      amountDT: breakdown.amountDT,
      platformPercent: breakdown.platformPercent,
      platformFixedDT: breakdown.platformFixedDT,
      platformFeeDT: breakdown.platformFeeDT,
      creatorNetDT: breakdown.creatorNetDT,
      promoCode: appliedCode,
      discountDT,
      status: 'pending',
      metadata: this.buildPendingFulfillmentMetadata({ provider: 'konnect' }),
    });

    const user = await this.userModel.findById(userId).select('email name firstName lastName');
    const successUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-success?scope=challenge&id=${challengeId}&provider=konnect&paymentRef=PAYMENT_REF_PLACEHOLDER`;
    const failUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-failed?scope=challenge&id=${challengeId}&provider=konnect`;

    const init = await this.konnect.initPayment({
      amountTND: amount,
      description: challenge.title || 'Challenge',
      orderId: pendingOrder._id.toString(),
      successUrl,
      failUrl,
      webhookUrl: this.getKonnectWebhookUrl(),
      firstName: (user as any)?.firstName || (user as any)?.name?.split(' ')[0] || '',
      lastName: (user as any)?.lastName || (user as any)?.name?.split(' ').slice(1).join(' ') || '',
      email: user?.email || '',
    });
    if (!init.success) throw new BadRequestException(init.error || 'Konnect payment init failed');

    pendingOrder.paymentId = init.paymentRef;
    await pendingOrder.save();

    return this.buildKonnectInitResponse({
      scope: 'challenge',
      targetId: challengeId,
      orderId: pendingOrder._id.toString(),
      paymentRef: init.paymentRef,
      payUrl: init.payUrl,
    });
  }

  @Post('konnect/init/event')
  @ApiOperation({ summary: 'Initiate Konnect payment for event ticket' })
  @ApiQuery({ name: 'promoCode', required: false })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async initKonnectEventPayment(
    @Body('eventId') eventId: string,
    @Body('ticketType') ticketType: string,
    @Req() req: any,
    @Query('promoCode') promoCode?: string,
  ) {
    const userId = (req.user?._id || req.user?.sub || '').toString();
    const event = await this.eventModel.findById(eventId);
    if (!event) throw new BadRequestException('Événement non trouvé');
    const alreadyRegistered = (event.attendees || []).some((attendee: any) => attendee?.userId?.toString() === userId);
    if (alreadyRegistered) throw new BadRequestException('Vous êtes déjà inscrit à cet événement');

    const ticket = event.tickets.find(t => t.type === ticketType);
    if (!ticket || (ticket.price || 0) <= 0) throw new BadRequestException('Billet invalide ou gratuit');

    let amount = ticket.price || 0;
    let discountDT = 0;
    let appliedCode: string | undefined;
    if (promoCode) {
      const buyer = await this.userModel.findById(userId).select('email');
      const promo = await this.promoService.validateAndApply(promoCode, amount, TrackableContentType.EVENT, (event as any)._id.toString(), (buyer as any)?.email);
      if (promo.valid) { amount = promo.finalAmountDT; discountDT = promo.discountDT; appliedCode = promo.appliedCode; }
    }

    const breakdown = await this.feeService.calculateForAmount(amount, event.creatorId.toString());
    const pendingOrder = await this.orderModel.create({
      buyerId: new Types.ObjectId(userId),
      creatorId: event.creatorId,
      contentType: TrackableContentType.EVENT,
      contentId: (event as any)._id.toString(),
      amountDT: breakdown.amountDT,
      platformPercent: breakdown.platformPercent,
      platformFixedDT: breakdown.platformFixedDT,
      platformFeeDT: breakdown.platformFeeDT,
      creatorNetDT: breakdown.creatorNetDT,
      promoCode: appliedCode,
      discountDT,
      status: 'pending',
      metadata: this.buildPendingFulfillmentMetadata({ provider: 'konnect', ticketType }),
    });

    const user = await this.userModel.findById(userId).select('email name firstName lastName');
    const successUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-success?scope=event&id=${eventId}&provider=konnect&paymentRef=PAYMENT_REF_PLACEHOLDER`;
    const failUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-failed?scope=event&id=${eventId}&provider=konnect`;

    const init = await this.konnect.initPayment({
      amountTND: amount,
      description: `${ticket.name || ticketType} - ${event.title || 'Event'}`,
      orderId: pendingOrder._id.toString(),
      successUrl,
      failUrl,
      webhookUrl: this.getKonnectWebhookUrl(),
      firstName: (user as any)?.firstName || (user as any)?.name?.split(' ')[0] || '',
      lastName: (user as any)?.lastName || (user as any)?.name?.split(' ').slice(1).join(' ') || '',
      email: user?.email || '',
    });
    if (!init.success) throw new BadRequestException(init.error || 'Konnect payment init failed');

    pendingOrder.paymentId = init.paymentRef;
    await pendingOrder.save();

    return this.buildKonnectInitResponse({
      scope: 'event',
      targetId: eventId,
      orderId: pendingOrder._id.toString(),
      paymentRef: init.paymentRef,
      payUrl: init.payUrl,
    });
  }

  @Post('konnect/init/product')
  @ApiOperation({ summary: 'Initiate Konnect payment for product purchase' })
  @ApiQuery({ name: 'promoCode', required: false })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async initKonnectProductPayment(
    @Body('productId') productId: string,
    @Req() req: any,
    @Query('promoCode') promoCode?: string,
  ) {
    const userId = (req.user?._id || req.user?.sub || '').toString();
    let product = await this.productModel.findById(productId);
    if (!product) product = await this.productModel.findOne({ id: productId });
    if (!product) throw new BadRequestException('Produit non trouvé');

    const existingPaidOrder = await this.findExistingPaidProductOrder(userId, product);
    if (existingPaidOrder) throw new BadRequestException('Product already purchased. You already have lifetime access.');

    const price = product.price || 0;
    if (price <= 0) throw new BadRequestException('Produit gratuit');

    let amount = price;
    let discountDT = 0;
    let appliedCode: string | undefined;
    if (promoCode) {
      const buyer = await this.userModel.findById(userId).select('email');
      const promo = await this.promoService.validateAndApply(promoCode, price, TrackableContentType.PRODUCT, product._id.toString(), (buyer as any)?.email);
      if (promo.valid) { amount = promo.finalAmountDT; discountDT = promo.discountDT; appliedCode = promo.appliedCode; }
    }

    const breakdown = await this.feeService.calculateForAmount(amount, product.creatorId.toString());
    const pendingOrder = await this.orderModel.create({
      buyerId: new Types.ObjectId(userId),
      creatorId: product.creatorId,
      contentType: TrackableContentType.PRODUCT,
      contentId: product._id.toString(),
      amountDT: breakdown.amountDT,
      platformPercent: breakdown.platformPercent,
      platformFixedDT: breakdown.platformFixedDT,
      platformFeeDT: breakdown.platformFeeDT,
      creatorNetDT: breakdown.creatorNetDT,
      promoCode: appliedCode,
      discountDT,
      status: 'pending',
      metadata: this.buildPendingFulfillmentMetadata({ provider: 'konnect' }),
    });

    const user = await this.userModel.findById(userId).select('email name firstName lastName');
    const successUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-success?scope=product&id=${productId}&provider=konnect&paymentRef=PAYMENT_REF_PLACEHOLDER`;
    const failUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-failed?scope=product&id=${productId}&provider=konnect`;

    const init = await this.konnect.initPayment({
      amountTND: amount,
      description: product.title || 'Product',
      orderId: pendingOrder._id.toString(),
      successUrl,
      failUrl,
      webhookUrl: this.getKonnectWebhookUrl(),
      firstName: (user as any)?.firstName || (user as any)?.name?.split(' ')[0] || '',
      lastName: (user as any)?.lastName || (user as any)?.name?.split(' ').slice(1).join(' ') || '',
      email: user?.email || '',
    });
    if (!init.success) throw new BadRequestException(init.error || 'Konnect payment init failed');

    pendingOrder.paymentId = init.paymentRef;
    await pendingOrder.save();

    return this.buildKonnectInitResponse({
      scope: 'product',
      targetId: productId,
      orderId: pendingOrder._id.toString(),
      paymentRef: init.paymentRef,
      payUrl: init.payUrl,
    });
  }

  @Post('konnect/init/session')
  @ApiOperation({ summary: 'Initiate Konnect payment for 1-to-1 session' })
  @ApiQuery({ name: 'promoCode', required: false })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async initKonnectSessionPayment(
    @Body('sessionId') sessionId: string,
    @Req() req: any,
    @Query('promoCode') promoCode?: string,
  ) {
    const userId = (req.user?._id || req.user?.sub || '').toString();
    const session = await this.sessionModel.findById(sessionId);
    if (!session) throw new BadRequestException('Session non trouvée');
    const price = session.price || 0;
    if (price <= 0) throw new BadRequestException('Session gratuite');

    let amount = price;
    let discountDT = 0;
    let appliedCode: string | undefined;
    if (promoCode) {
      const buyer = await this.userModel.findById(userId).select('email');
      const promo = await this.promoService.validateAndApply(promoCode, price, TrackableContentType.SESSION, session._id.toString(), (buyer as any)?.email);
      if (promo.valid) { amount = promo.finalAmountDT; discountDT = promo.discountDT; appliedCode = promo.appliedCode; }
    }

    const breakdown = await this.feeService.calculateForAmount(amount, session.creatorId.toString());
    const pendingOrder = await this.orderModel.create({
      buyerId: new Types.ObjectId(userId),
      creatorId: session.creatorId,
      contentType: TrackableContentType.SESSION,
      contentId: session._id.toString(),
      amountDT: breakdown.amountDT,
      platformPercent: breakdown.platformPercent,
      platformFixedDT: breakdown.platformFixedDT,
      platformFeeDT: breakdown.platformFeeDT,
      creatorNetDT: breakdown.creatorNetDT,
      promoCode: appliedCode,
      discountDT,
      status: 'pending',
      metadata: this.buildPendingFulfillmentMetadata({ provider: 'konnect' }),
    });

    const user = await this.userModel.findById(userId).select('email name firstName lastName');
    const successUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-success?scope=session&id=${sessionId}&provider=konnect&paymentRef=PAYMENT_REF_PLACEHOLDER`;
    const failUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-failed?scope=session&id=${sessionId}&provider=konnect`;

    const init = await this.konnect.initPayment({
      amountTND: amount,
      description: session.title || 'Session',
      orderId: pendingOrder._id.toString(),
      successUrl,
      failUrl,
      webhookUrl: this.getKonnectWebhookUrl(),
      firstName: (user as any)?.firstName || (user as any)?.name?.split(' ')[0] || '',
      lastName: (user as any)?.lastName || (user as any)?.name?.split(' ').slice(1).join(' ') || '',
      email: user?.email || '',
    });
    if (!init.success) throw new BadRequestException(init.error || 'Konnect payment init failed');

    pendingOrder.paymentId = init.paymentRef;
    await pendingOrder.save();

    return this.buildKonnectInitResponse({
      scope: 'session',
      targetId: sessionId,
      orderId: pendingOrder._id.toString(),
      paymentRef: init.paymentRef,
      payUrl: init.payUrl,
    });
  }

  @Post('konnect/init/subscription')
  @ApiOperation({ summary: 'Initiate Konnect payment for creator subscription' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async initKonnectSubscription(
    @Req() req: any,
    @Body('tier') tier: string,
  ) {
    const userId = (req.user?._id || req.user?.sub || '').toString();
    const plan = await this.planModel.findOne({ tier, isActive: true });
    if (!plan) throw new BadRequestException('Plan introuvable');
    const amount = (plan as any).priceMonthlyDT || (plan as any).priceDT || 0;
    if (amount <= 0) throw new BadRequestException('Montant invalide');

    const breakdown = await this.feeService.calculateForAmount(amount, userId);
    const pendingOrder = await this.orderModel.create({
      buyerId: new Types.ObjectId(userId),
      creatorId: new Types.ObjectId(userId),
      contentType: TrackableContentType.SUBSCRIPTION,
      contentId: tier,
      amountDT: breakdown.amountDT,
      platformPercent: breakdown.platformPercent,
      platformFixedDT: breakdown.platformFixedDT,
      platformFeeDT: breakdown.platformFeeDT,
      creatorNetDT: breakdown.creatorNetDT,
      status: 'pending',
      metadata: this.buildPendingFulfillmentMetadata({ provider: 'konnect' }),
    });

    const user = await this.userModel.findById(userId).select('email name firstName lastName');
    const successUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-success?scope=subscription&tier=${tier}&provider=konnect&paymentRef=PAYMENT_REF_PLACEHOLDER`;
    const failUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-failed?scope=subscription&tier=${tier}&provider=konnect`;

    const init = await this.konnect.initPayment({
      amountTND: amount,
      description: `${plan.name || tier} Plan Subscription`,
      orderId: pendingOrder._id.toString(),
      successUrl,
      failUrl,
      webhookUrl: this.getKonnectWebhookUrl(),
      firstName: (user as any)?.firstName || (user as any)?.name?.split(' ')[0] || '',
      lastName: (user as any)?.lastName || (user as any)?.name?.split(' ').slice(1).join(' ') || '',
      email: user?.email || '',
    });
    if (!init.success) throw new BadRequestException(init.error || 'Konnect payment init failed');

    pendingOrder.paymentId = init.paymentRef;
    await pendingOrder.save();

    return this.buildKonnectInitResponse({
      scope: 'subscription',
      targetId: tier,
      orderId: pendingOrder._id.toString(),
      paymentRef: init.paymentRef,
      payUrl: init.payUrl,
    });
  }

  @Get('konnect/verify')
  @ApiOperation({ summary: 'Verify Konnect payment status' })
  @ApiQuery({ name: 'paymentRef', required: true })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async verifyKonnectPayment(@Query('paymentRef') paymentRef: string) {
    if (!paymentRef) throw new BadRequestException('paymentRef is required');

    let order: any = await this.orderModel.findOne({ paymentId: paymentRef });
    if (!order) throw new BadRequestException('Order not found for this payment reference');

    const details = await this.konnect.getPaymentDetails(paymentRef);
    if (!details.success) throw new BadRequestException(details.error || 'Failed to verify Konnect payment');

    if (details.status === 'completed') {
      await this.auditPaymentEvent({
        orderId: order._id?.toString?.(),
        eventType: 'provider_verification_completed',
        provider: 'konnect',
        eventId: paymentRef,
        paymentMethod: details.paymentMethod || 'konnect',
        previousStatus: order.status,
        nextStatus: 'paid',
      });

      let didCompleteFulfillment = false;
      await this.runWithOptionalTransaction(async (session) => {
        const claim = await this.paymentFulfillmentService.claimForProcessing(
          order._id.toString(),
          details.paymentMethod || 'konnect',
          session,
        );
        if (!claim.order) throw new BadRequestException('Order not found');
        order = claim.order;

        if (claim.state === 'requires_booking' || claim.state === 'completed') return;
        if (claim.state !== 'claimed') return;

        try {
          await this.grantAccess(order, session);
          order = await this.paymentFulfillmentService.markCompleted(order, session);
          didCompleteFulfillment = true;
        } catch (error: any) {
          if (order.contentType === TrackableContentType.SESSION && this.isMissingScheduledAtError(error)) {
            order = await this.paymentFulfillmentService.markRequiresBooking(order, session, {
              contentId: order.metadata?.contentId || order.contentId,
            });
            return;
          }
          await this.paymentFulfillmentService.markFailed(order, error, session);
          throw error;
        }
      });

      if (didCompleteFulfillment) {
        await this.incrementProductSalesFromOrder(order);
        await this.affiliateCommissionService.onOrderPaid(order).catch((e) => this.logger.error(`Affiliate onOrderPaid failed: ${e?.message}`));
      }

      if (order.contentType === TrackableContentType.SESSION && order.metadata?.fulfillmentStatus === 'requires_booking') {
        return {
          status: 'paid_action_required',
          action: 'choose_session_slot',
          message: 'Payment received. Please choose a session slot to finalize your booking.',
          orderId: order._id,
          sessionContentId: order.metadata?.contentId || order.contentId,
          ...(await this.enrichOrderDetails(order)),
        };
      }

      const enriched = await this.enrichOrderDetails(order);
      return { status: 'paid', orderId: order._id, provider: 'konnect', ...enriched };
    }

    if (details.status === 'failed') {
      if (order.status !== 'failed') {
        order.status = 'failed';
        await order.save();
      }
      return { status: 'failed', orderId: order._id, provider: 'konnect' };
    }

    return { status: 'pending', orderId: order._id, provider: 'konnect' };
  }

  @Get('konnect/webhook')
  @ApiOperation({ summary: 'Konnect payment webhook (GET with payment_ref query param)' })
  async konnectWebhook(@Query('payment_ref') paymentRef: string) {
    this.logger.log(`[Konnect Webhook] Received callback for payment_ref=${paymentRef}`);
    if (!paymentRef) throw new BadRequestException('payment_ref is required');

    const alreadyProcessed = await this.hasProcessedWebhookEvent('konnect', paymentRef);
    if (alreadyProcessed) {
      this.logger.log(`[Konnect Webhook] Already processed: ${paymentRef}`);
      return { status: 'already_processed' };
    }

    const details = await this.konnect.getPaymentDetails(paymentRef);
    if (!details.success) {
      this.logger.warn(`[Konnect Webhook] Failed to fetch details for ${paymentRef}: ${details.error}`);
      return { status: 'verification_failed' };
    }

    let order: any = await this.orderModel.findOne({ paymentId: paymentRef });
    if (!order) {
      this.logger.warn(`[Konnect Webhook] No order found for paymentRef=${paymentRef}`);
      return { status: 'order_not_found' };
    }

    if (details.status === 'completed') {
      await this.auditPaymentEvent({
        orderId: order._id?.toString?.(),
        eventType: 'webhook_payment_completed',
        provider: 'konnect',
        eventId: paymentRef,
        paymentMethod: details.paymentMethod || 'konnect',
        previousStatus: order.status,
        nextStatus: 'paid',
      });

      let didCompleteFulfillment = false;
      await this.runWithOptionalTransaction(async (session) => {
        const claim = await this.paymentFulfillmentService.claimForProcessing(
          order._id.toString(),
          details.paymentMethod || 'konnect',
          session,
        );
        if (!claim.order) return;
        order = claim.order;

        if (claim.state === 'requires_booking' || claim.state === 'completed') return;
        if (claim.state !== 'claimed') return;

        try {
          await this.grantAccess(order, session);
          order = await this.paymentFulfillmentService.markCompleted(order, session);
          didCompleteFulfillment = true;
        } catch (error: any) {
          if (order.contentType === TrackableContentType.SESSION && this.isMissingScheduledAtError(error)) {
            order = await this.paymentFulfillmentService.markRequiresBooking(order, session, {
              contentId: order.metadata?.contentId || order.contentId,
            });
            return;
          }
          await this.paymentFulfillmentService.markFailed(order, error, session);
          this.logger.error(`[Konnect Webhook] Fulfillment failed for order ${order._id}: ${error?.message}`);
        }
      });

      if (didCompleteFulfillment) {
        await this.incrementProductSalesFromOrder(order);
        await this.affiliateCommissionService.onOrderPaid(order).catch((e) => this.logger.error(`Affiliate onOrderPaid failed: ${e?.message}`));
      }

      await this.markWebhookEventProcessed('konnect', paymentRef, 'payment_completed');
      return { status: 'fulfilled' };
    }

    if (details.status === 'failed') {
      if (order.status !== 'failed') {
        order.status = 'failed';
        await order.save();
      }
      await this.markWebhookEventProcessed('konnect', paymentRef, 'payment_failed');
      return { status: 'payment_failed' };
    }

    return { status: 'pending' };
  }

  /**
   * Mock-only endpoint: confirms a Konnect mock payment as succeeded or failed.
   * Only works when KONNECT_MOCK_MODE=true. Used by the /konnect-mock-checkout frontend page.
   * GET /api/payment/konnect/mock/confirm?paymentRef=xxx&outcome=success|fail
   */
  @Get('konnect/mock/confirm')
  @ApiOperation({ summary: '[DEV MOCK] Confirm a Konnect mock payment as success or failure' })
  @ApiQuery({ name: 'paymentRef', required: true })
  @ApiQuery({ name: 'outcome', required: false, description: 'success (default) or fail' })
  async confirmKonnectMockPayment(
    @Query('paymentRef') paymentRef: string,
    @Query('outcome') outcome: string = 'success',
  ) {
    if (!this.konnect.isMockMode) {
      throw new BadRequestException('Mock mode is not enabled. Set KONNECT_MOCK_MODE=true.');
    }
    if (!paymentRef) throw new BadRequestException('paymentRef is required');

    const normalizedOutcome = String(outcome).toLowerCase() === 'fail' ? 'fail' : 'success';
    const confirmed = this.konnect.confirmMockPayment(paymentRef, normalizedOutcome as 'success' | 'fail');

    if (!confirmed) throw new BadRequestException('Could not confirm mock payment');

    this.logger.log(`[Konnect Mock] Payment ${paymentRef} confirmed as ${normalizedOutcome}`);
    return {
      success: true,
      paymentRef,
      outcome: normalizedOutcome,
      message: `Mock payment marked as ${normalizedOutcome}. Now call /payment/konnect/verify?paymentRef=${paymentRef} to complete fulfillment.`,
    };
  }
}
