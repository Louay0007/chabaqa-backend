import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CommunityAffCreaJoinController } from './community-aff-crea-join.controller';
import { CommunityAffCreaJoinService } from './community-aff-crea-join.service';
import { Community, CommunitySchema } from '../schema/community.schema';
import { User, UserSchema } from '../schema/user.schema';
import { UploadModule } from 'src/upload/upload.module';
import { PolicyModule } from '../common/modules/policy.module';
import { FeeModule } from '../common/modules/fee.module';
import { PromoModule } from '../common/modules/promo.module';
import { OrderSchema } from '../schema/order.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Community.name, schema: CommunitySchema },
      { name: User.name, schema: UserSchema },
      { name: 'Order', schema: OrderSchema }
    ]),
    UploadModule,
    PolicyModule,
    FeeModule,
    PromoModule
  ],
  controllers: [CommunityAffCreaJoinController],
  providers: [CommunityAffCreaJoinService],
  exports: [CommunityAffCreaJoinService]
})
export class CommunityAffCreaJoinModule {} 