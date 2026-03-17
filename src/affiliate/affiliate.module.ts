import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { AffiliateProgram, AffiliateProgramSchema } from './schemas/affiliate-program.schema';
import { AffiliatePartner, AffiliatePartnerSchema } from './schemas/affiliate-partner.schema';
import { AffiliateLink, AffiliateLinkSchema } from './schemas/affiliate-link.schema';
import { AffiliateClick, AffiliateClickSchema } from './schemas/affiliate-click.schema';
import { AffiliateConversion, AffiliateConversionSchema } from './schemas/affiliate-conversion.schema';
import { AffiliatePayoutRequest, AffiliatePayoutRequestSchema } from './schemas/affiliate-payout-request.schema';
import { AffiliateService } from './affiliate.service';
import { AffiliateAttributionService } from './affiliate-attribution.service';
import { AffiliateCommissionService } from './affiliate-commission.service';
import { AffiliatePayoutService } from './affiliate-payout.service';
import { AffiliateCreatorController } from './affiliate.controller';
import { AffiliatePartnerController } from './affiliate-partner.controller';
import { AffiliateAdminController } from './affiliate-admin.controller';
import { AffiliateRedirectController } from './affiliate-redirect.controller';
import { Order, OrderSchema } from '../schema/order.schema';
import { User, UserSchema } from '../schema/user.schema';
import { CommunityAccessModule } from '../community-access/community-access.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    CommunityAccessModule,
    MongooseModule.forFeature([
      { name: AffiliateProgram.name, schema: AffiliateProgramSchema },
      { name: AffiliatePartner.name, schema: AffiliatePartnerSchema },
      { name: AffiliateLink.name, schema: AffiliateLinkSchema },
      { name: AffiliateClick.name, schema: AffiliateClickSchema },
      { name: AffiliateConversion.name, schema: AffiliateConversionSchema },
      { name: AffiliatePayoutRequest.name, schema: AffiliatePayoutRequestSchema },
      { name: Order.name, schema: OrderSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [
    AffiliateCreatorController,
    AffiliatePartnerController,
    AffiliateAdminController,
    AffiliateRedirectController,
  ],
  providers: [
    AffiliateService,
    AffiliateAttributionService,
    AffiliateCommissionService,
    AffiliatePayoutService,
  ],
  exports: [
    AffiliateAttributionService,
    AffiliateCommissionService,
  ],
})
export class AffiliateModule {}
