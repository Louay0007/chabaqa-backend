import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import axios, { AxiosError } from 'axios';
import {
  WebhookConfig,
  WebhookConfigDocument,
  WebhookEvent,
} from '../schema/webhook-config.schema';

const MAX_CONSECUTIVE_FAILURES = 5;
const DELIVERY_TIMEOUT_MS = 10_000;

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @InjectModel(WebhookConfig.name)
    private webhookConfigModel: Model<WebhookConfigDocument>,
  ) {}

  // ── Management ──────────────────────────────────────────────

  async createWebhook(
    creatorId: string,
    communityId: string,
    data: { name: string; url: string; events: WebhookEvent[] },
  ): Promise<WebhookConfigDocument> {
    const secret = crypto.randomBytes(32).toString('hex');

    return this.webhookConfigModel.create({
      creatorId: new Types.ObjectId(creatorId),
      communityId,
      name: data.name.trim(),
      url: data.url,
      events: data.events,
      secret,
      isActive: true,
    });
  }

  async listWebhooks(
    communityId: string,
  ): Promise<WebhookConfigDocument[]> {
    return this.webhookConfigModel
      .find({ communityId })
      .sort({ createdAt: -1 });
  }

  async getWebhook(
    webhookId: string,
    communityId: string,
  ): Promise<WebhookConfigDocument | null> {
    return this.webhookConfigModel.findOne({
      _id: new Types.ObjectId(webhookId),
      communityId,
    });
  }

  async updateWebhook(
    webhookId: string,
    creatorId: string,
    updates: Partial<{ name: string; url: string; events: WebhookEvent[]; isActive: boolean }>,
  ): Promise<WebhookConfigDocument | null> {
    return this.webhookConfigModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(webhookId),
        creatorId: new Types.ObjectId(creatorId),
      },
      { $set: updates },
      { new: true },
    );
  }

  async deleteWebhook(webhookId: string, creatorId: string): Promise<void> {
    await this.webhookConfigModel.deleteOne({
      _id: new Types.ObjectId(webhookId),
      creatorId: new Types.ObjectId(creatorId),
    });
  }

  // ── Delivery ────────────────────────────────────────────────

  /**
   * Find all active webhooks subscribed to this event and dispatch them.
   * Fires-and-forgets per webhook; never throws.
   */
  async triggerWebhook(
    communityId: string,
    event: WebhookEvent,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const webhooks = await this.webhookConfigModel.find({
      communityId,
      isActive: true,
      events: event,
    });

    if (!webhooks.length) return;

    const enrichedPayload = {
      event,
      timestamp: new Date().toISOString(),
      ...payload,
    };

    await Promise.allSettled(
      webhooks.map((webhook) => this.deliverWebhook(webhook, enrichedPayload)),
    );
  }

  private async deliverWebhook(
    webhook: WebhookConfigDocument,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const body = JSON.stringify(payload);
    const signature = this.buildSignature(webhook.secret, body);

    try {
      await axios.post(webhook.url, body, {
        headers: {
          'Content-Type': 'application/json',
          'X-Chabaqa-Event': payload.event as string,
          'X-Chabaqa-Signature': `sha256=${signature}`,
          'X-Chabaqa-Timestamp': payload.timestamp as string,
        },
        timeout: DELIVERY_TIMEOUT_MS,
      });

      // Reset failure counter on success
      await this.webhookConfigModel.findByIdAndUpdate(webhook._id, {
        lastTriggeredAt: new Date(),
        failuresCount: 0,
        lastFailureReason: null,
      });

      this.logger.log(
        `Webhook delivered: "${webhook.name}" → ${payload.event}`,
      );
    } catch (err: unknown) {
      const message =
        err instanceof AxiosError
          ? `HTTP ${err.response?.status ?? 'timeout'}: ${err.message}`
          : (err as Error).message;

      const newFailureCount = (webhook.failuresCount ?? 0) + 1;
      const shouldDisable = newFailureCount >= MAX_CONSECUTIVE_FAILURES;

      await this.webhookConfigModel.findByIdAndUpdate(webhook._id, {
        $inc: { failuresCount: 1 },
        lastFailureReason: message,
        ...(shouldDisable ? { isActive: false } : {}),
      });

      this.logger.error(
        `Webhook failed: "${webhook.name}" — ${message}${shouldDisable ? ' (disabled after repeated failures)' : ''}`,
      );
    }
  }

  /** HMAC-SHA256 signature over the raw JSON body string */
  buildSignature(secret: string, rawBody: string): string {
    return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  }

  /** Verify a signature from an incoming request (for consumers to call) */
  verifySignature(
    secret: string,
    rawBody: string,
    receivedSignature: string,
  ): boolean {
    const expected = `sha256=${this.buildSignature(secret, rawBody)}`;
    try {
      return crypto.timingSafeEqual(
        Buffer.from(expected),
        Buffer.from(receivedSignature),
      );
    } catch {
      return false;
    }
  }
}
