import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConsentRecord, ConsentRecordDocument, ConsentType } from '../schema/consent-record.schema';

@Injectable()
export class GdprService {
  private readonly logger = new Logger(GdprService.name);

  constructor(
    @InjectModel(ConsentRecord.name)
    private consentModel: Model<ConsentRecordDocument>,
  ) {}

  async recordConsent(
    userId: string,
    consentType: ConsentType,
    granted: boolean,
    req?: { ip?: string; headers?: Record<string, any> },
    version = '1.0',
  ): Promise<ConsentRecordDocument> {
    const ipAddress = req?.ip || req?.headers?.['x-forwarded-for'] || '';
    const userAgent = req?.headers?.['user-agent'] || '';

    const record = await this.consentModel.create({
      userId: new Types.ObjectId(userId),
      consentType,
      version,
      granted,
      grantedAt: new Date(),
      ipAddress: String(ipAddress).split(',')[0].trim(),
      userAgent: String(userAgent),
    });

    this.logger.log(`Consent recorded: user=${userId} type=${consentType} granted=${granted}`);
    return record;
  }

  async getUserConsents(userId: string): Promise<ConsentRecordDocument[]> {
    return this.consentModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ grantedAt: -1 })
      .lean() as any;
  }

  async revokeConsent(userId: string, consentType: ConsentType): Promise<void> {
    await this.consentModel.updateMany(
      {
        userId: new Types.ObjectId(userId),
        consentType,
        granted: true,
        revokedAt: { $exists: false },
      },
      { $set: { revokedAt: new Date() } },
    );
    this.logger.log(`Consent revoked: user=${userId} type=${consentType}`);
  }

  async deleteUserConsents(userId: string): Promise<void> {
    await this.consentModel.deleteMany({ userId: new Types.ObjectId(userId) });
  }

  async recordSignupConsents(
    userId: string,
    req?: { ip?: string; headers?: Record<string, any> },
  ): Promise<void> {
    await Promise.all([
      this.recordConsent(userId, ConsentType.TERMS, true, req),
      this.recordConsent(userId, ConsentType.PRIVACY, true, req),
    ]);
  }
}
