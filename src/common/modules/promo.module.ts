import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PromoService } from '../services/promo.service';
import { PromoCode, PromoCodeSchema } from '../../schema/promo-code.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PromoCode.name, schema: PromoCodeSchema },
    ]),
  ],
  providers: [PromoService],
  exports: [PromoService],
})
export class PromoModule {}


