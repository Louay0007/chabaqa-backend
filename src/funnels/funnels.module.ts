import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FunnelsController } from './funnels.controller';
import { FunnelsService } from './funnels.service';
import { Funnel, FunnelSchema } from '../schema/funnel.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Funnel.name, schema: FunnelSchema }]),
  ],
  controllers: [FunnelsController],
  providers: [FunnelsService],
  exports: [FunnelsService],
})
export class FunnelsModule {}
