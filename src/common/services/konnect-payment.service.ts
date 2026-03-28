import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

export interface KonnectInitResult {
  success: boolean;
  paymentRef?: string;
  payUrl?: string;
  error?: string;
}

export interface KonnectPaymentDetails {
  success: boolean;
  status?: 'completed' | 'pending' | 'failed';
  amountTND?: number;
  paymentMethod?: string;
  transactionDate?: string;
  rawPayment?: Record<string, any>;
  error?: string;
}

@Injectable()
export class KonnectPaymentService {
  private readonly logger = new Logger(KonnectPaymentService.name);
  private readonly http: AxiosInstance;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly walletId: string;
  private readonly mockMode: boolean;

  // In-memory store for mock payment refs → status
  // mock_<orderId>_success  → always returns completed
  // mock_<orderId>_fail     → always returns failed
  private readonly mockPayments = new Map<string, 'completed' | 'failed'>();

  constructor() {
    const isProduction = ['1', 'true', 'yes'].includes(
      String(process.env.KONNECT_IS_PRODUCTION || '').trim().toLowerCase(),
    );

    // Mock mode is active when KONNECT_MOCK_MODE=true OR when no API key is configured
    this.mockMode =
      ['1', 'true', 'yes'].includes(
        String(process.env.KONNECT_MOCK_MODE || '').trim().toLowerCase(),
      ) || !process.env.KONNECT_API_KEY || process.env.KONNECT_API_KEY === 'your-konnect-api-key';

    this.baseUrl =
      process.env.KONNECT_BASE_URL ||
      (isProduction
        ? 'https://api.konnect.network/api/v2'
        : 'https://api.sandbox.konnect.network/api/v2');
    this.apiKey = process.env.KONNECT_API_KEY || '';
    this.walletId = process.env.KONNECT_WALLET_ID || '';

    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: 20000,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
    });

    if (this.mockMode) {
      this.logger.warn(
        '[Konnect] ⚠️  MOCK MODE ACTIVE — no real API calls will be made. ' +
        'Set KONNECT_MOCK_MODE=false and provide real credentials to use live Konnect.',
      );
    }
  }

  get isMockMode(): boolean {
    return this.mockMode;
  }

  // ─────────────────────────────────────────────
  // MOCK helpers
  // ─────────────────────────────────────────────

  /**
   * Builds the mock checkout URL.
   * The frontend (or Swagger) opens this URL, which immediately redirects to
   * the successUrl so you can test the full happy-path without any Konnect account.
   *
   * To simulate a FAILED payment, append ?simulate=fail to the checkout URL.
   */
  private buildMockPayUrl(
    paymentRef: string,
    successUrl: string,
    failUrl: string,
  ): string {
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
    // The mock checkout page lives at /konnect-mock-checkout on the frontend.
    // It reads ?paymentRef, ?successUrl, ?failUrl from the query and lets the
    // developer choose success or failure.
    const encodedSuccess = encodeURIComponent(successUrl);
    const encodedFail = encodeURIComponent(failUrl);
    return `${frontendUrl}/konnect-mock-checkout?paymentRef=${paymentRef}&successUrl=${encodedSuccess}&failUrl=${encodedFail}`;
  }

  // ─────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────

  /**
   * Initiate a payment via Konnect hosted checkout.
   * POST /payments/init-payment
   */
  async initPayment(params: {
    amountTND: number;
    description: string;
    orderId: string;
    successUrl: string;
    failUrl: string;
    webhookUrl: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phoneNumber?: string;
  }): Promise<KonnectInitResult> {
    // ── MOCK MODE ────────────────────────────────
    if (this.mockMode) {
      const paymentRef = `mock_${params.orderId}_${Date.now()}`;
      // Pre-register as pending; the mock checkout page will mark it completed/failed
      this.mockPayments.set(paymentRef, 'completed'); // default: success
      const payUrl = this.buildMockPayUrl(paymentRef, params.successUrl, params.failUrl);
      this.logger.log(`[Konnect MOCK] initPayment → ref=${paymentRef} payUrl=${payUrl}`);
      return { success: true, paymentRef, payUrl };
    }

    // ── REAL MODE ────────────────────────────────
    try {
      const payload = {
        receiverWalletId: this.walletId,
        amount: Math.round(params.amountTND * 1000),
        token: params.orderId,
        type: 'immediate',
        description: params.description,
        acceptedPaymentMethods: ['wallet', 'bank_card', 'e-DINAR', 'flouci'],
        lifespan: 30,
        checkoutForm: true,
        addPaymentFeesToAmount: false,
        firstName: params.firstName || '',
        lastName: params.lastName || '',
        email: params.email || '',
        phoneNumber: params.phoneNumber || '',
        orderId: params.orderId,
        webhook: params.webhookUrl,
        silentWebhook: true,
        successUrl: params.successUrl,
        failUrl: params.failUrl,
        theme: 'light',
      };

      this.logger.log(
        `[Konnect] Initiating payment for order ${params.orderId}, amount=${params.amountTND} TND`,
      );

      const res = await this.http.post('/payments/init-payment', payload);
      const payUrl = res.data?.payUrl;
      const paymentRef = res.data?.paymentRef;

      if (!payUrl || !paymentRef) {
        this.logger.warn('[Konnect] init-payment succeeded but missing payUrl or paymentRef');
        return { success: false, error: 'Invalid response from Konnect' };
      }

      this.logger.log(`[Konnect] Payment initiated: ref=${paymentRef}`);
      return { success: true, paymentRef, payUrl };
    } catch (e: any) {
      const errorData = e?.response?.data;
      const msg =
        errorData?.errors?.[0]?.message ||
        errorData?.message ||
        e?.message ||
        'Konnect payment init failed';
      this.logger.error(`[Konnect] initPayment failed: ${msg}`);
      return { success: false, error: msg };
    }
  }

  /**
   * Retrieve payment details from Konnect.
   * GET /payments/{paymentRef}
   */
  async getPaymentDetails(paymentRef: string): Promise<KonnectPaymentDetails> {
    // ── MOCK MODE ────────────────────────────────
    if (this.mockMode) {
      const mockStatus = this.mockPayments.get(paymentRef) ?? 'completed';
      this.logger.log(`[Konnect MOCK] getPaymentDetails ref=${paymentRef} → ${mockStatus}`);
      return {
        success: true,
        status: mockStatus,
        amountTND: undefined,
        paymentMethod: 'mock_bank_card',
        transactionDate: new Date().toISOString(),
      };
    }

    // ── REAL MODE ────────────────────────────────
    try {
      const res = await this.http.get(`/payments/${encodeURIComponent(paymentRef)}`);
      const payment = res.data?.payment || res.data;

      const rawStatus = String(payment?.status || '').toLowerCase();
      let status: 'completed' | 'pending' | 'failed';
      if (rawStatus === 'completed' || rawStatus === 'paid') {
        status = 'completed';
      } else if (rawStatus === 'failed' || rawStatus === 'expired' || rawStatus === 'canceled') {
        status = 'failed';
      } else {
        status = 'pending';
      }

      const transactions: any[] = payment?.transactions || [];
      const successfulTx = transactions.find(
        (t: any) => String(t?.status || '').toLowerCase() === 'completed',
      );

      return {
        success: true,
        status,
        amountTND: typeof payment?.amount === 'number' ? payment.amount / 1000 : undefined,
        paymentMethod: successfulTx?.type || payment?.type,
        transactionDate: payment?.updatedAt || payment?.createdAt,
        rawPayment: payment,
      };
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'Payment details fetch failed';
      this.logger.error(`[Konnect] getPaymentDetails failed for ${paymentRef}: ${msg}`);
      return { success: false, error: msg };
    }
  }

  /**
   * Called by the mock checkout page to mark a payment as succeeded or failed.
   * Only works in mock mode. Exposed via GET /payment/konnect/mock/confirm
   */
  confirmMockPayment(paymentRef: string, outcome: 'success' | 'fail'): boolean {
    if (!this.mockMode) return false;
    this.mockPayments.set(paymentRef, outcome === 'success' ? 'completed' : 'failed');
    this.logger.log(`[Konnect MOCK] Payment ${paymentRef} marked as ${outcome}`);
    return true;
  }
}
