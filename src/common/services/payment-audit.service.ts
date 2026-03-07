import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  PaymentAuditLog,
  PaymentAuditLogDocument,
} from '../../schema/payment-audit-log.schema';

interface PaymentAuditEntry {
  orderId?: string | Types.ObjectId;
  eventType: string;
  provider?: string;
  eventId?: string;
  paymentMethod?: string;
  previousStatus?: string;
  nextStatus?: string;
  reason?: string;
  error?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class PaymentAuditService {
  private readonly logger = new Logger(PaymentAuditService.name);

  constructor(
    @InjectModel(PaymentAuditLog.name)
    private readonly paymentAuditLogModel: Model<PaymentAuditLogDocument>,
  ) {}

  async log(entry: PaymentAuditEntry, session: any = null): Promise<void> {
    try {
      const payload = {
        ...entry,
        orderId: this.normalizeOrderId(entry.orderId),
        metadata: entry.metadata || {},
      };

      const document = new this.paymentAuditLogModel(payload);
      await document.save(session ? { session } : undefined);
    } catch (error: any) {
      this.logger.error(
        `Failed to persist payment audit log ${entry.eventType}: ${error?.message || error}`,
      );
    }
  }

  private normalizeOrderId(orderId?: string | Types.ObjectId): Types.ObjectId | undefined {
    if (!orderId) return undefined;
    if (orderId instanceof Types.ObjectId) return orderId;
    return Types.ObjectId.isValid(orderId) ? new Types.ObjectId(orderId) : undefined;
  }
}
