import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { Product, ProductSchema } from '../schema/product.schema';
import { Community, CommunitySchema } from '../schema/community.schema';
import { User, UserSchema } from '../schema/user.schema';
import { AuthModule } from '../auth/auth.module';
import { FeeModule } from '../common/modules/fee.module';
import { OrderSchema } from '../schema/order.schema';
import { PolicyModule } from '../common/modules/policy.module';
import { PromoModule } from '../common/modules/promo.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: Community.name, schema: CommunitySchema },
      { name: User.name, schema: UserSchema },
      { name: 'Order', schema: OrderSchema }
    ]),
    AuthModule,
    FeeModule,
    PolicyModule,
    PromoModule
  ],
  controllers: [ProductController],
  providers: [ProductService],
  exports: [ProductService]
})
export class ProductModule {}