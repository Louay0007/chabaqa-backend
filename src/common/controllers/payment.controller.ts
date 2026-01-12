import { Controller, Post, Body, Query, Get, BadRequestException, UnauthorizedException, Req, UseGuards, UseInterceptors, UploadedFile, Param } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as crypto from 'crypto';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FlouciPaymentService } from '../services/flouci-payment.service';
import { StripePaymentService } from '../services/stripe-payment.service';
import { ManualPaymentService } from '../services/manual-payment.service';
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
import { Plan, PlanDocument, PlanTier } from '../../schema/plan.schema';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { NotificationService } from '../../notification/notification.service';
import { EmailService } from '../services/email.service';

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
@Controller('payments')
export class PaymentController {
  constructor(
    private readonly flouci: FlouciPaymentService,
    private readonly stripe: StripePaymentService,
    private readonly promoService: PromoService,
    private readonly feeService: FeeService,
    private readonly manualPaymentService: ManualPaymentService,
    private readonly uploadService: UploadService,
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
    private readonly coursService: CoursService,
    private readonly challengeService: ChallengeService,
    private readonly eventService: EventService,
    private readonly subscriptionService: SubscriptionService,
    @InjectModel(Plan.name) private planModel: Model<PlanDocument>,
  ) { }

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

  @Post('init/community')
  @ApiOperation({ summary: 'Initiate Flouci payment for community membership' })
  @ApiQuery({ name: 'promoCode', required: false })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async initCommunityPayment(
    @Body('communityId') communityId: string,
    @Req() req: any,
    @Query('promoCode') promoCode?: string,
  ) {
    const userId = (req.user?._id || req.user?.sub || '').toString();
    const community = await this.communityModel.findById(communityId);
    if (!community) throw new BadRequestException('Communauté non trouvée');

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
    });

    const offlineMode = (process.env.PAYMENT_MODE || 'instant') === 'offline';
    if (offlineMode) {
      pendingOrder.paymentId = pendingOrder._id.toString();
      await pendingOrder.save();
      return { mode: 'offline', paymentId: pendingOrder.paymentId };
    }

    const successUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/success?scope=community&id=${communityId}`;
    const failUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/failed?scope=community&id=${communityId}`;

    const init = await this.flouci.initPayment({
      amountTND: amount,
      successUrl,
      failUrl,
      metadata: { userId, contentType: 'community', contentId: communityId },
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
    let order = await this.orderModel.findOne({ paymentId });
    if (!order) {
      const byId = await this.orderModel.findById(paymentId as any);
      if (byId && byId.status !== 'paid') {
        const offlineMode = (process.env.PAYMENT_MODE || 'instant') === 'offline';
        if (offlineMode) {
          byId.status = 'paid';
          await byId.save();
        }
      }
      order = byId || null;
    }
    if (!order) throw new BadRequestException('Commande non trouvée');
    const verify = (process.env.PAYMENT_MODE || 'instant') === 'offline'
      ? { success: true, status: 'SUCCESS', paymentMethod: 'offline' }
      : await this.flouci.verifyPayment(paymentId);
    if (!verify.success) throw new BadRequestException((verify as any).error);

    const offlineMode = (process.env.PAYMENT_MODE || 'instant') === 'offline';

    if (verify.status === 'SUCCESS' || offlineMode) {
      order.status = 'paid';
      order.paymentMethod = offlineMode ? 'offline' : ((verify as any).paymentMethod || order.paymentMethod);
      await order.save();

      if (order.contentType === TrackableContentType.COMMUNITY) {
        const community = await this.communityModel.findById(order.contentId);
        if (community) {
          community.addMember(order.buyerId);
          await community.save();
        }
      } else if (order.contentType === TrackableContentType.SUBSCRIPTION) {
        // contentId holds plan tier string
        const tier = (order.contentId || 'STARTER') as PlanTier;
        await this.subscriptionService.upgradePlan(order.buyerId.toString(), tier);
      } else if (order.contentType === TrackableContentType.COURSE) {
        await this.coursService.inscrireAuCours(order.contentId, order.buyerId.toString());
      } else if (order.contentType === TrackableContentType.CHALLENGE) {
        await this.challengeService.joinChallenge({ challengeId: order.contentId } as any, order.buyerId.toString());
      } else if (order.contentType === TrackableContentType.EVENT) {
        // ticketType is not persisted; for production, persist in Order metadata. Here we skip auto-registration.
      } else if (order.contentType === TrackableContentType.PRODUCT) {
        // Add product purchase logic here
      } else if (order.contentType === TrackableContentType.SESSION) {
        // Add session purchase logic here
      }
      return { status: 'paid' };
    }

    order.status = 'pending';
    await order.save();
    return { status: verify.status };
  }

  @Post('init/subscription')
  @ApiOperation({ summary: 'Initier un paiement Flouci pour une souscription' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async initSubscription(
    @Req() req: any,
    @Body('tier') tier: PlanTier
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

    const successUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/success?scope=subscription&tier=${tier}`;
    const failUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/failed?scope=subscription&tier=${tier}`;
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
      status: offlineMode ? 'pending' : 'pending',
    });

    if (offlineMode) {
      pendingOrder.paymentId = pendingOrder._id.toString();
      await pendingOrder.save();
      return { mode: 'offline', paymentId: pendingOrder.paymentId };
    }

    const successUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/success?scope=course&id=${coursePublicId}`;
    const failUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/failed?scope=course&id=${coursePublicId}`;
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
      status: offlineMode ? 'pending' : 'pending',
    });

    if (offlineMode) {
      pendingOrder.paymentId = pendingOrder._id.toString();
      await pendingOrder.save();
      return { mode: 'offline', paymentId: pendingOrder.paymentId };
    }

    const successUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/success?scope=challenge&id=${challengeId}`;
    const failUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/failed?scope=challenge&id=${challengeId}`;
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
      status: offlineMode ? 'pending' : 'pending',
    });
    if (offlineMode) {
      pendingOrder.paymentId = pendingOrder._id.toString();
      await pendingOrder.save();
      return { mode: 'offline', paymentId: pendingOrder.paymentId };
    }
    const successUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/success?scope=event&id=${eventId}`;
    const failUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/failed?scope=event&id=${eventId}`;
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
    const product = await this.productModel.findById(productId);
    if (!product) throw new BadRequestException('Produit non trouvé');
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
      status: offlineMode ? 'pending' : 'pending',
    });
    if (offlineMode) {
      pendingOrder.paymentId = pendingOrder._id.toString();
      await pendingOrder.save();
      return { mode: 'offline', paymentId: pendingOrder.paymentId };
    }
    const successUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/success?scope=product&id=${productId}`;
    const failUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/failed?scope=product&id=${productId}`;
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
      status: offlineMode ? 'pending' : 'pending',
    });
    if (offlineMode) {
      pendingOrder.paymentId = pendingOrder._id.toString();
      await pendingOrder.save();
      return { mode: 'offline', paymentId: pendingOrder.paymentId };
    }
    const successUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/success?scope=session&id=${sessionId}`;
    const failUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/failed?scope=session&id=${sessionId}`;
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
    @Req() req: any,
    @Query('promoCode') promoCode?: string,
  ) {
    const userId = (req.user?._id || req.user?.sub || '').toString();
    const community = await this.communityModel.findById(communityId);
    if (!community) throw new BadRequestException('Community not found');

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
    });

    const successUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/success?scope=community&id=${communityId}&provider=stripe`;
    const failUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/failed?scope=community&id=${communityId}&provider=stripe`;

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
        orderId: pendingOrder._id.toString()
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

    return {
      checkoutUrl: session.url,
      sessionId: session.sessionId,
      provider: 'stripe-link'
    };
  }

  @Post('stripe-link/init/course')
  @ApiOperation({ summary: 'Initiate Stripe Link payment for course enrollment' })
  @ApiQuery({ name: 'promoCode', required: false })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async initStripeLinkCoursePayment(
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
    if (!cours) throw new BadRequestException('Course not found');
    const courseObjectId = cours._id;
    const coursePublicId = cours.id || courseObjectId.toString();

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
    });

    const successUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/success?scope=course&id=${coursePublicId}&provider=stripe&sessionId={CHECKOUT_SESSION_ID}`;
    const failUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/failed?scope=course&id=${courseId}&provider=stripe`;

    const user = await this.userModel.findById(userId).select('email name');
    const session = await this.stripe.createLinkCheckoutSession({
      amountDT: amount,
      successUrl,
      cancelUrl: failUrl,
      customerEmail: user?.email,
      metadata: {
        userId,
        contentType: 'course',
        contentId: courseId,
        orderId: pendingOrder._id.toString()
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

    return {
      checkoutUrl: session.url,
      sessionId: session.sessionId,
      provider: 'stripe-link'
    };
  }

  @Post('stripe-link/init/subscription')
  @ApiOperation({ summary: 'Initiate Stripe Link subscription payment' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async initStripeLinkSubscription(
    @Req() req: any,
    @Body('tier') tier: PlanTier,
    @Body('interval') interval: 'month' | 'year' = 'month'
  ) {
    const userId = (req.user?._id || req.user?.sub || '').toString();
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
    });

    // Create Stripe price for the subscription
    const priceResult = await this.stripe.createPrice({
      amountDT: amount,
      interval,
      productName: `${plan.name} Plan`,
      productDescription: `Subscription to ${plan.name} plan`
    });

    if (!priceResult.success) throw new BadRequestException(priceResult.error);

    const successUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/success?scope=subscription&tier=${tier}&provider=stripe`;
    const failUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/failed?scope=subscription&tier=${tier}&provider=stripe`;

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
        orderId: pendingOrder._id.toString()
      },
      trialPeriodDays: plan.trialDays
    });

    if (!session.success) throw new BadRequestException(session.error);

    pendingOrder.paymentId = session.sessionId;
    await pendingOrder.save();

    return {
      checkoutUrl: session.url,
      sessionId: session.sessionId,
      provider: 'stripe-link'
    };
  }

  @Get('stripe-link/verify')
  @ApiOperation({ summary: 'Verify Stripe Link payment' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async verifyStripeLinkPayment(@Query('sessionId') sessionId: string) {
    const verify = await this.stripe.verifyLinkPayment(sessionId);
    if (!verify.success) throw new BadRequestException(verify.error);

    // Find the order by session ID
    const order = await this.orderModel.findOne({ paymentId: sessionId });
    if (!order) throw new BadRequestException('Order not found');

    if (verify.status === 'succeeded') {
      order.status = 'paid';
      order.paymentMethod = verify.paymentMethod?.type || 'stripe-link';
      await order.save();

      // Grant access based on content type
      if (order.contentType === TrackableContentType.COMMUNITY) {
        const community = await this.communityModel.findById(order.contentId);
        if (community) {
          community.addMember(order.buyerId);
          await community.save();
        }
      } else if (order.contentType === TrackableContentType.SUBSCRIPTION) {
        const tier = (order.contentId || 'STARTER') as PlanTier;
        await this.subscriptionService.upgradePlan(order.buyerId.toString(), tier);
      } else if (order.contentType === TrackableContentType.COURSE) {
        await this.coursService.inscrireAuCours(order.contentId, order.buyerId.toString());
      } else if (order.contentType === TrackableContentType.CHALLENGE) {
        await this.challengeService.joinChallenge({ challengeId: order.contentId } as any, order.buyerId.toString());
      }

      return {
        status: 'paid',
        paymentMethod: verify.paymentMethod,
        customerId: verify.customerId
      };
    }

    order.status = 'pending';
    await order.save();
    return { status: verify.status };
  }

  @Post('stripe-link/webhook')
  @ApiOperation({ summary: 'Stripe Link webhook handler' })
  async stripeLinkWebhook(@Req() req: any) {
    const signature = req.headers['stripe-signature'] as string;
    if (!signature) throw new UnauthorizedException('Missing Stripe signature');

    const event = await this.stripe.createWebhookEvent(req.body, signature);
    if (!event.success) throw new UnauthorizedException(event.error);

    const stripeEvent = event.event!;

    // Handle different event types
    switch (stripeEvent.type) {
      case 'checkout.session.completed':
        const session = stripeEvent.data.object as any;
        if (session.payment_status === 'paid') {
          // Process successful payment
          const order = await this.orderModel.findOne({ paymentId: session.id });
          if (order && order.status !== 'paid') {
            order.status = 'paid';
            await order.save();

            // Grant access based on content type
            if (order.contentType === TrackableContentType.COMMUNITY) {
              const community = await this.communityModel.findById(order.contentId);
              if (community) {
                community.addMember(order.buyerId);
                await community.save();
              }
            } else if (order.contentType === TrackableContentType.SUBSCRIPTION) {
              const tier = (order.contentId || 'STARTER') as PlanTier;
              await this.subscriptionService.upgradePlan(order.buyerId.toString(), tier);
            }
          }
        }
        break;

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        // Handle subscription changes
        break;
    }

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

  // ==================== MANUAL PAYMENT ENDPOINTS ====================

  @Post('manual/init/community')
  @ApiOperation({ summary: 'Initiate manual payment (transfer) for community membership' })
  @ApiQuery({ name: 'promoCode', required: false })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('proof', { storage: manualProofStorage }))
  async initManualCommunityPayment(
    @Body('communityId') communityId: string,
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Query('promoCode') promoCode?: string,
  ) {
    if (!file) throw new BadRequestException('Payment proof file is required');

    const userId = (req.user?._id || req.user?.sub || '').toString();
    const community = await this.communityModel.findById(communityId);
    if (!community) throw new BadRequestException('Community not found');

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
    const uploadResult = await this.uploadService.processUploadedFile(file, file.filename, { userId });

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
      paymentProof: uploadResult.url
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
    const uploadResult = await this.uploadService.processUploadedFile(file, file.filename, { userId });

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
    const uploadResult = await this.uploadService.processUploadedFile(file, file.filename, { userId });

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
    const uploadResult = await this.uploadService.processUploadedFile(file, file.filename, { userId });

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

    const existing = await this.orderModel.findOne({
      buyerId: new Types.ObjectId(userId),
      creatorId: product.creatorId,
      paymentMethod: 'manual',
      contentType: TrackableContentType.PRODUCT,
      contentId: product._id.toString(),
      status: { $in: ['pending_verification', 'paid'] },
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
    const uploadResult = await this.uploadService.processUploadedFile(file, file.filename, { userId });

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
    const uploadResult = await this.uploadService.processUploadedFile(file, file.filename, { userId });

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
      const order = await this.manualPaymentService.verifyPayment(orderId, userId, action);

      const buyer = await this.userModel.findById(order.buyerId).select('email name').exec();

      // If approved, trigger content access granting logic if needed
      if (action === 'approve') {
        if (order.contentType === TrackableContentType.COMMUNITY) {
          const community = await this.communityModel.findById(order.contentId);
          if (community) {
            community.addMember(order.buyerId);
            await community.save();
          }
        } else if (order.contentType === TrackableContentType.SUBSCRIPTION) {
          // contentId holds plan tier string
          const tier = (order.contentId || 'STARTER') as PlanTier;
          await this.subscriptionService.upgradePlan(order.buyerId.toString(), tier);
        } else if (order.contentType === TrackableContentType.COURSE) {
          await this.coursService.inscrireAuCours(order.contentId, order.buyerId.toString());
        } else if (order.contentType === TrackableContentType.CHALLENGE) {
          await this.challengeService.joinChallenge({ challengeId: order.contentId } as any, order.buyerId.toString());
        } else if (order.contentType === TrackableContentType.SESSION) {
          // Create a booking for the session when payment is approved
          console.log(`[verifyManualPayment] Processing session payment for order ${order._id}, contentId: ${order.contentId}`);
          
          // Try finding by _id first (contentId is stored as session._id.toString())
          let session = await this.sessionModel.findById(order.contentId);
          if (!session) {
            // Try finding by custom id field as fallback
            session = await this.sessionModel.findOne({ id: order.contentId });
          }
          console.log(`[verifyManualPayment] Session lookup result: ${session ? `found (id: ${session.id}, _id: ${session._id})` : 'not found'}`);
          
          if (session) {
            // Check if booking already exists for this user
            const existingBooking = session.bookings.find(b => 
              b.userId.toString() === order.buyerId.toString()
            );
            
            if (!existingBooking) {
              // Get slot info from order metadata if available
              const metadata = (order as any).metadata || {};
              const slotId = metadata.slotId;
              const slotStartTime = metadata.slotStartTime;
              const slotEndTime = metadata.slotEndTime;
              const notes = metadata.notes;

              // Create booking record
              const bookingId = new Types.ObjectId().toString();
              session.bookings.push({
                id: bookingId,
                userId: order.buyerId,
                scheduledAt: slotStartTime ? new Date(slotStartTime) : new Date(),
                status: 'confirmed',
                notes: notes || undefined,
                createdAt: new Date(),
                updatedAt: new Date(),
              } as any);
              
              // Mark bookings as modified to ensure Mongoose saves it
              session.markModified('bookings');
              await session.save();
              
              console.log(`[verifyManualPayment] Created booking ${bookingId} for session ${session.id}, user ${order.buyerId}`);
              console.log(`[verifyManualPayment] Session now has ${session.bookings.length} bookings`);
            } else {
              console.log(`[verifyManualPayment] Booking already exists for user ${order.buyerId} in session ${session.id}`);
            }
          } else {
            console.error(`[verifyManualPayment] Session not found for order ${order._id}, contentId: ${order.contentId}`);
          }
        } else if (order.contentType === TrackableContentType.PRODUCT) {
          // Product access is granted by paid order checks in downstream APIs.
        } else if (order.contentType === TrackableContentType.EVENT) {
          // Event ticket type isn't stored on the order; access is granted by paid order checks.
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
}
