import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  DataResidencySettings,
  DataResidencySettingsSchema,
} from '../schema/data-residency.schema';
import { DataResidencyController } from './data-residency.controller';
import { DataResidencyService } from './data-residency.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DataResidencySettings.name, schema: DataResidencySettingsSchema },
    ]),
  ],
  controllers: [DataResidencyController],
  providers: [DataResidencyService],
  exports: [DataResidencyService],
})
export class DataResidencyModule {}
