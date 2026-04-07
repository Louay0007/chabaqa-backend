import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { VerificationCode, VerificationCodeDocument } from '../schema/verification-code.schema';
import { User, UserDocument } from '../schema/user.schema';

@Injectable()
export class DataRetentionScheduler {
  private readonly logger = new Logger(DataRetentionScheduler.name);

  // Configurable retention periods from env
  private get auditRetentionDays(): number {
    return parseInt(process.env.DATA_RETENTION_AUDIT_DAYS || '730', 10);
  }

  private get inactiveAccountYears(): number {
    return parseInt(process.env.DATA_RETENTION_INACTIVE_YEARS || '2', 10);
  }

  constructor(
    @InjectModel(VerificationCode.name)
    private verificationCodeModel: Model<VerificationCodeDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async runRetentionJobs(): Promise<void> {
    this.logger.log('🕐 Running data retention jobs...');
    await Promise.allSettled([
      this.deleteExpiredVerificationCodes(),
      this.anonymizeInactiveAccounts(),
    ]);
    this.logger.log('✅ Data retention jobs complete');
  }

  async deleteExpiredVerificationCodes(): Promise<void> {
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const result = await this.verificationCodeModel.deleteMany({
        $or: [
          { expiresAt: { $lt: cutoff } },
          { isUsed: true, createdAt: { $lt: cutoff } },
        ],
      });
      this.logger.log(`Deleted ${result.deletedCount} expired verification codes`);
    } catch (err) {
      this.logger.error('Failed to delete expired verification codes', err);
    }
  }

  async anonymizeInactiveAccounts(): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setFullYear(cutoffDate.getFullYear() - this.inactiveAccountYears);

      const inactiveUsers = await this.userModel
        .find({
          accountStatus: 'inactive',
          updatedAt: { $lt: cutoffDate },
          name: { $not: /^Deleted User/ },
        })
        .select('_id')
        .lean();

      if (inactiveUsers.length === 0) return;

      for (const user of inactiveUsers) {
        const id = user._id.toString();
        await this.userModel.updateOne(
          { _id: user._id },
          {
            $set: {
              name: 'Deleted User',
              email: `deleted_${id}@chabaqa.invalid`,
              numtel: null,
              date_naissance: null,
              photo_profil: null,
              profile_picture: null,
              bio: null,
              accountStatus: 'anonymized',
            },
          },
        );
      }

      this.logger.log(`Anonymized ${inactiveUsers.length} inactive accounts`);
    } catch (err) {
      this.logger.error('Failed to anonymize inactive accounts', err);
    }
  }
}
