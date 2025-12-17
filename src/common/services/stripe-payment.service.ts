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

  constructor(private configService: ConfigService) {
    const stripeKey = this.configService.get('STRIPE_SECRET_KEY');
    if (!stripeKey) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }
    this.stripe = new Stripe(stripeKey);
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
      // Convert TND to smallest currency unit (millimes)
      const amount = Math.round(params.amountDT * 1000);
      const currency = params.currency || 'tnd';

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
            unit_amount: Math.round(item.amount * 1000),
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
        amountDT: paymentIntent.amount / 1000, // Convert from millimes to TND
        paymentMethod,
        customerId: customer?.id,
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
        unit_amount: Math.round(params.amountDT * 1000),
        currency: params.currency || 'tnd',
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