import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StripePaymentService } from '../services/stripe-payment.service';
import { FlouciPaymentService } from '../services/flouci-payment.service';
import { KonnectPaymentService } from '../services/konnect-payment.service';
import { PaymentController } from '../controllers/payment.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Community, CommunitySchema } from '../../schema/community.schema';
import { User, UserSchema } from '../../schema/user.schema';
import { Order, OrderSchema } from '../../schema/order.schema';
import { PromoCode, PromoCodeSchema } from '../../schema/promo-code.schema';
import { Subscription, SubscriptionSchema } from '../../schema/subscription.schema';
import { Plan, PlanSchema } from '../../schema/plan.schema';
import { Cours, CoursSchema } from '../../schema/course.schema';
import { Challenge, ChallengeSchema } from '../../schema/challenge.schema';
import { Event, EventSchema } from '../../schema/event.schema';
import { Product, ProductSchema } from '../../schema/product.schema';
import { Session, SessionSchema } from '../../schema/session.schema';
import {
  ProcessedWebhookEvent,
  ProcessedWebhookEventSchema,
} from '../../schema/processed-webhook-event.schema';
import {
  PaymentAuditLog,
  PaymentAuditLogSchema,
} from '../../schema/payment-audit-log.schema';
import { PromoService } from '../services/promo.service';
import { FeeService } from '../services/fee.service';
import { ManualPaymentService } from '../services/manual-payment.service';
import { EmailService } from '../services/email.service';
import { PaymentFulfillmentService } from '../services/payment-fulfillment.service';
import { PaymentAuditService } from '../services/payment-audit.service';
import { UploadModule } from '../../upload/upload.module';
import { NotificationModule } from '../../notification/notification.module';
import { CoursModule } from '../../cours/cours.module';
import { ChallengeModule } from '../../challenge/challenge.module';
import { EventModule } from '../../event/event.module';
import { SubscriptionModule } from '../../subscription/subscription.module';
import { SessionModule } from '../../session/session.module';
import { ProductModule } from '../../product/product.module';
import { AffiliateModule } from '../../affiliate/affiliate.module';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot(),
    MongooseModule.forFeature([
      { name: Community.name, schema: CommunitySchema },
      { name: User.name, schema: UserSchema },
      { name: Order.name, schema: OrderSchema },
      { name: PromoCode.name, schema: PromoCodeSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: Plan.name, schema: PlanSchema },
      { name: Cours.name, schema: CoursSchema },
      { name: Challenge.name, schema: ChallengeSchema },
      { name: Event.name, schema: EventSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Session.name, schema: SessionSchema },
      { name: ProcessedWebhookEvent.name, schema: ProcessedWebhookEventSchema },
      { name: PaymentAuditLog.name, schema: PaymentAuditLogSchema },
    ]),
    UploadModule,
    NotificationModule,
    CoursModule,
    ChallengeModule,
    EventModule,
    SubscriptionModule,
    SessionModule,
    ProductModule,
    AffiliateModule,
  ],
  controllers: [PaymentController],
  providers: [
    FlouciPaymentService,
    StripePaymentService,
    KonnectPaymentService,
    PromoService,
    FeeService,
    ManualPaymentService,
    EmailService,
    PaymentFulfillmentService,
    PaymentAuditService,
  ],
  exports: [
    FlouciPaymentService,
    StripePaymentService,
    KonnectPaymentService,
    ManualPaymentService,
    PromoService,
    FeeService,
    PaymentFulfillmentService,
    PaymentAuditService,
  ],
})
export class PaymentModule { }
