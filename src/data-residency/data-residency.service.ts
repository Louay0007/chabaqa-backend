import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  DataResidencySettings,
  DataResidencySettingsDocument,
  DataRegion,
} from '../schema/data-residency.schema';

@Injectable()
export class DataResidencyService {
  private readonly logger = new Logger(DataResidencyService.name);

  // Region to MongoDB connection string mapping
  private readonly regionConnectionStrings: Record<DataRegion, string> = {
    [DataRegion.EU]: process.env.MONGO_URI_EU || process.env.MONGO_URI || '',
    [DataRegion.US]: process.env.MONGO_URI_US || process.env.MONGO_URI || '',
    [DataRegion.MEA]: process.env.MONGO_URI_MEA || process.env.MONGO_URI || '',
    [DataRegion.APAC]: process.env.MONGO_URI_APAC || process.env.MONGO_URI || '',
  };

  constructor(
    @InjectModel(DataResidencySettings.name)
    private settingsModel: Model<DataResidencySettingsDocument>,
  ) {}

  async getUserRegion(userId: string): Promise<DataRegion> {
    const settings = await this.settingsModel.findOne({
      userId: new Types.ObjectId(userId),
    });
    return settings?.preferredRegion || DataRegion.US;
  }

  async getUserSettings(
    userId: string,
  ): Promise<DataResidencySettingsDocument | null> {
    return this.settingsModel.findOne({ userId: new Types.ObjectId(userId) });
  }

  async setUserRegion(userId: string, region: DataRegion): Promise<void> {
    const allowedRegions = Object.values(DataRegion);
    if (!allowedRegions.includes(region)) {
      throw new BadRequestException(
        `Invalid region. Allowed: ${allowedRegions.join(', ')}`,
      );
    }

    await this.settingsModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      {
        preferredRegion: region,
        migrationStatus: 'pending',
        lastMigratedAt: new Date(),
      },
      { upsert: true, new: true },
    );

    // In production: trigger an async data migration job here
    this.logger.log(`User ${userId} requested region change to ${region}`);
  }

  async getAvailableRegions(): Promise<
    { code: string; name: string; description: string }[]
  > {
    return [
      {
        code: DataRegion.US,
        name: 'United States',
        description: 'Default — lowest latency for Americas',
      },
      {
        code: DataRegion.EU,
        name: 'European Union',
        description: 'GDPR-compliant storage in EU',
      },
      {
        code: DataRegion.MEA,
        name: 'Middle East & Africa',
        description: 'Optimal for MENA region users',
      },
      {
        code: DataRegion.APAC,
        name: 'Asia Pacific',
        description: 'Optimal for Asian market users',
      },
    ];
  }

  getConnectionStringForRegion(region: DataRegion): string {
    return this.regionConnectionStrings[region];
  }
}
