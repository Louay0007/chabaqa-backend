import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MulterModule } from '@nestjs/platform-express';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { WalletAdminController } from './wallet-admin.controller';
import { User, UserSchema } from '../schema/user.schema';
import { TopUpRequest, TopUpRequestSchema } from '../schema/topup-request.schema';
import { WalletTransaction, WalletTransactionSchema } from '../schema/wallet-transaction.schema';
import { Community, CommunitySchema } from '../schema/community.schema';
import { Product, ProductSchema } from '../schema/product.schema';
import { Challenge, ChallengeSchema } from '../schema/challenge.schema';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: TopUpRequest.name, schema: TopUpRequestSchema },
      { name: WalletTransaction.name, schema: WalletTransactionSchema },
      { name: Community.name, schema: CommunitySchema },
      { name: Product.name, schema: ProductSchema },
      { name: Challenge.name, schema: ChallengeSchema },
    ]),
    MulterModule.register({
      dest: './uploads/topup-proofs',
    }),
    UploadModule,
  ],
  controllers: [WalletController, WalletAdminController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
