import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { ConfigService } from '@nestjs/config';

export interface LinkCheckoutSession {
  success: boolean;
  sessionId?: string;
  url?: string;
  error?: string;
}

export interface LinkPaymentMethod {
  id: string;
  type: string;
  card?: {
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
  };
  bank_account?: {
    bank_name: string;
    last4: string;
  };
}

@Injectable()
export class StripePaymentService {
  private readonly stripe: Stripe;
  private cachedTndToUsdRate: number = 0.32; // Fallback rate
  private rateLastFetched: number = 0;
  private readonly RATE_CACHE_DURATION_MS = 1200000;

  constructor(private configService: ConfigService) {
    const stripeKey = this.configService.get('STRIPE_SECRET_KEY');
    if (!stripeKey) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }
    this.stripe = new Stripe(stripeKey);
  }

  /**
   * Get TND to USD conversion rate (uses live API with caching and fallback)
   */
  private async getTndToUsdRate(): Promise<number> {
    const now = Date.now();

    // Return cached rate if still valid
    if (this.rateLastFetched && (now - this.rateLastFetched) < this.RATE_CACHE_DURATION_MS) {
      return this.cachedTndToUsdRate;
    }

    try {
      // Using exchangerate-api.com free tier (no API key required for basic usage)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch('https://api.exchangerate-api.com/v4/latest/TND', {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (response.ok) {
        const data = await response.json();
        if (data?.rates?.USD) {
          this.cachedTndToUsdRate = data.rates.USD;
          this.rateLastFetched = now;
          console.log(`[Stripe] Updated TND->USD rate: ${this.cachedTndToUsdRate}`);
        }
      }
    } catch (error) {
      console.warn('[Stripe] Failed to fetch live exchange rate, using cached/fallback:', error);
    }

    return this.cachedTndToUsdRate;
  }

  /**
   * Create a Stripe Link checkout session for faster, more secure payments
   */
  async createLinkCheckoutSession(params: {
    amountDT: number;
    currency?: string;
    successUrl: string;
    cancelUrl: string;
    metadata?: Record<string, any>;
    customerEmail?: string;
    lineItems?: Array<{
      name: string;
      description?: string;
      amount: number;
      quantity?: number;
    }>;
  }): Promise<LinkCheckoutSession> {
    try {
      const inputCurrency = (params.currency || 'tnd').toLowerCase();
      let stripeCurrency = inputCurrency;
      let amountInStripeCurrency = params.amountDT;
      let conversionRate = 1;

      if (inputCurrency === 'tnd') {
        const tndToUsdRate = await this.getTndToUsdRate();
        stripeCurrency = 'usd';
        conversionRate = tndToUsdRate;
        amountInStripeCurrency = params.amountDT * tndToUsdRate;
      }

      const amount = Math.round(amountInStripeCurrency * 100);
      const currency = stripeCurrency;

      // Create checkout session with Link enabled
      const session = await this.stripe.checkout.sessions.create({
        mode: 'payment',
        currency,
        line_items: params.lineItems ? params.lineItems.map(item => ({
          price_data: {
            currency,
            product_data: {
              name: item.name,
              description: item.description,
            },
            unit_amount: Math.round((item.amount * conversionRate) * 100),
          },
          quantity: item.quantity || 1,
        })) : [{
          price_data: {
            currency,
            product_data: {
              name: 'Payment',
            },
            unit_amount: amount,
          },
          quantity: 1,
        }],
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        metadata: params.metadata || {},
        customer_email: params.customerEmail,
        // Enable automatic tax calculation if available
        automatic_tax: { enabled: false },
        // Enable customer creation for better Link experience
        customer_creation: 'always',
      });

      return {
        success: true,
        sessionId: session.id,
        url: session.url || undefined,
      };
    } catch (e: any) {
      return {
        success: false,
        error: e?.message || 'Link checkout session creation failed',
      };
    }
  }

  /**
   * Create a subscription checkout session with Link support
   */
  async createLinkSubscriptionSession(params: {
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    customerEmail?: string;
    metadata?: Record<string, any>;
    trialPeriodDays?: number;
  }): Promise<LinkCheckoutSession> {
    try {
      const session = await this.stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{
          price: params.priceId,
          quantity: 1,
        }],
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        customer_email: params.customerEmail,
        metadata: params.metadata || {},
        subscription_data: {
          trial_period_days: params.trialPeriodDays,
          metadata: params.metadata || {},
        },
        customer_creation: 'always',
      });

      return {
        success: true,
        sessionId: session.id,
        url: session.url || undefined,
      };
    } catch (e: any) {
      return {
        success: false,
        error: e?.message || 'Link subscription session creation failed',
      };
    }
  }

  /**
   * Retrieve checkout session details
   */
  async getCheckoutSession(sessionId: string): Promise<{
    success: boolean;
    session?: Stripe.Checkout.Session;
    error?: string;
  }> {
    try {
      const session = await this.stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['payment_intent', 'subscription'],
      });

      return {
        success: true,
        session,
      };
    } catch (e: any) {
      return {
        success: false,
        error: e?.message || 'Failed to retrieve checkout session',
      };
    }
  }

  /**
   * Verify payment status from checkout session
   */
  async verifyLinkPayment(sessionId: string): Promise<{
    success: boolean;
    status?: string;
    amountDT?: number;
    paymentMethod?: LinkPaymentMethod;
    customerId?: string;
    sessionMetadata?: Record<string, string>;
    error?: string;
  }> {
    try {
      const session = await this.stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['payment_intent', 'customer'],
      });

      if (!session.payment_intent) {
        return {
          success: false,
          error: 'No payment intent found',
        };
      }

      const paymentIntent = session.payment_intent as Stripe.PaymentIntent;
      const customer = session.customer as Stripe.Customer;


      let paymentMethod: LinkPaymentMethod | undefined;
      if (paymentIntent.payment_method) {
        const pm = await this.stripe.paymentMethods.retrieve(
          paymentIntent.payment_method as string
        );
        paymentMethod = {
          id: pm.id,
          type: pm.type,
          card: pm.card ? {
            brand: pm.card.brand,
            last4: pm.card.last4,
            exp_month: pm.card.exp_month,
            exp_year: pm.card.exp_year,
          } : undefined,
          bank_account: pm.us_bank_account ? {
            bank_name: pm.us_bank_account.bank_name || 'Unknown',
            last4: pm.us_bank_account.last4 || '',
          } : undefined,
        };
      }

      return {
        success: true,
        status: paymentIntent.status,
        amountDT: paymentIntent.amount / 100, // Convert from cents to dollars
        paymentMethod,
        customerId: customer?.id,
        sessionMetadata: (session.metadata || {}) as Record<string, string>,
      };
    } catch (e: any) {
      return {
        success: false,
        error: e?.message || 'Payment verification failed',
      };
    }
  }

  /**
   * Create webhook event for Link-specific events
   */
  async createWebhookEvent(
    body: Buffer,
    signature: string,
  ): Promise<{ success: boolean; event?: Stripe.Event; error?: string }> {
    try {
      const webhookSecret = this.configService.get('STRIPE_WEBHOOK_SECRET');
      const event = this.stripe.webhooks.constructEvent(
        body,
        signature,
        webhookSecret,
      );

      return {
        success: true,
        event,
      };
    } catch (e: any) {
      return {
        success: false,
        error: e?.message || 'Invalid webhook payload',
      };
    }
  }

  /**
   * Create a customer portal session for subscription management
   */
  async createCustomerPortalSession(customerId: string, returnUrl: string): Promise<{
    success: boolean;
    url?: string;
    error?: string;
  }> {
    try {
      const session = await this.stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });

      return {
        success: true,
        url: session.url,
      };
    } catch (e: any) {
      return {
        success: false,
        error: e?.message || 'Failed to create customer portal session',
      };
    }
  }

  /**
   * Refund a payment
   */
  async refundPayment(
    paymentIntentId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await this.stripe.refunds.create({
        payment_intent: paymentIntentId,
      });

      return { success: true };
    } catch (e: any) {
      return {
        success: false,
        error: e?.message || 'Refund failed',
      };
    }
  }

  /**
   * Create a price for subscription plans
   */
  async createPrice(params: {
    amountDT: number;
    currency?: string;
    interval: 'month' | 'year';
    productName: string;
    productDescription?: string;
  }): Promise<{
    success: boolean;
    priceId?: string;
    error?: string;
  }> {
    try {
      // First create a product
      const product = await this.stripe.products.create({
        name: params.productName,
        description: params.productDescription,
      });

      // Then create a price
      const price = await this.stripe.prices.create({
        unit_amount: Math.round(params.amountDT * 100),
        currency: params.currency || 'usd',
        recurring: {
          interval: params.interval,
        },
        product: product.id,
      });

      return {
        success: true,
        priceId: price.id,
      };
    } catch (e: any) {
      return {
        success: false,
        error: e?.message || 'Price creation failed',
      };
    }
  }
}
