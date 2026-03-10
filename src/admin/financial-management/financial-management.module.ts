import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FinancialManagementController } from './financial-management.controller';
import { FinancialManagementService } from './financial-management.service';

// Import schemas
import { Subscription, SubscriptionSchema } from '../../schema/subscription.schema';
import { WalletTransaction, WalletTransactionSchema } from '../../schema/wallet-transaction.schema';
import { Payout, PayoutSchema } from '../../schema/payout.schema';
import { Community, CommunitySchema } from '../../schema/community.schema';
import { User, UserSchema } from '../../schema/user.schema';
import { Plan, PlanSchema } from '../../schema/plan.schema';

// Import admin common services
import { AuditLogService } from '../common/services/audit-log.service';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';
import { AdminRolesGuard } from '../common/guards/admin-roles.guard';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: WalletTransaction.name, schema: WalletTransactionSchema },
      { name: Payout.name, schema: PayoutSchema },
      { name: Community.name, schema: CommunitySchema },
      { name: User.name, schema: UserSchema },
      { name: Plan.name, schema: PlanSchema },
    ]),
  ],
  controllers: [FinancialManagementController],
  providers: [
    FinancialManagementService,
    AuditLogService,
    AdminAuthGuard,
    AdminRolesGuard,
  ],
  exports: [FinancialManagementService],
})
export class FinancialManagementModule {}
