import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

type Ga4EventParams = Record<string, string | number | boolean | null | undefined>;

interface Ga4EventPayload {
  userId?: string;
  clientId?: string;
  name: string;
  params?: Ga4EventParams;
}

@Injectable()
export class Ga4Service {
  private readonly logger = new Logger(Ga4Service.name);
  private readonly measurementId: string | undefined;
  private readonly apiSecret: string | undefined;
  private readonly endpoint: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.measurementId = this.configService.get<string>('GA4_MEASUREMENT_ID');
    this.apiSecret = this.configService.get<string>('GA4_API_SECRET');
    if (this.measurementId && this.apiSecret) {
      this.endpoint = `https://www.google-analytics.com/mp/collect?measurement_id=${this.measurementId}&api_secret=${this.apiSecret}`;
    }
  }

  private isEnabled(): boolean {
    return !!this.endpoint;
  }

  async sendEvent(payload: Ga4EventPayload): Promise<void> {
    if (!this.isEnabled()) {
      // GA4 not configured – fail silently
      return;
    }

    const body = {
      client_id: payload.clientId || 'server-generated',
      user_id: payload.userId,
      events: [
        {
          name: payload.name,
          params: payload.params || {},
        },
      ],
    };

    try {
      await axios.post(this.endpoint as string, body, {
        timeout: 2000,
      });
    } catch (error) {
      // Never break business logic because of GA4
      this.logger.warn(`Failed to send GA4 event "${payload.name}": ${error}`);
    }
  }

  async sendPurchase(
    userId: string | undefined,
    clientId: string | undefined,
    params: Ga4EventParams,
  ): Promise<void> {
    return this.sendEvent({
      userId,
      clientId,
      name: 'purchase',
      params,
    });
  }
}

