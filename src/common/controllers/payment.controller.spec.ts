import { UnauthorizedException } from '@nestjs/common';
import { PaymentController } from './payment.controller';

describe('PaymentController webhook hardening', () => {
  const buildController = (overrides: {
    countDocuments?: jest.Mock;
    updateOne?: jest.Mock;
    createWebhookEvent?: jest.Mock;
    orderFindOne?: jest.Mock;
    auditLog?: jest.Mock;
  } = {}) => {
    const stripe = {
      createWebhookEvent: overrides.createWebhookEvent || jest.fn(),
    };
    const orderModel = {
      findOne: overrides.orderFindOne || jest.fn(),
    };
    const processedWebhookEventModel = {
      countDocuments: overrides.countDocuments || jest.fn().mockResolvedValue(0),
      updateOne: overrides.updateOne || jest.fn().mockResolvedValue({}),
    };
    const paymentAuditService = {
      log: overrides.auditLog || jest.fn().mockResolvedValue(undefined),
    };

    const controller = new PaymentController(
      {} as any,
      stripe as any,
      {} as any, // konnect
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      paymentAuditService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      orderModel as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      processedWebhookEventModel as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { resolveAttributionFromRequest: jest.fn().mockReturnValue({}) } as any,
      { onOrderPaid: jest.fn().mockResolvedValue(null) } as any,
    );
    (controller as any).processedWebhookEventModel = processedWebhookEventModel;

    return { controller, stripe, orderModel, processedWebhookEventModel, paymentAuditService };
  };

  it('rejects a missing stripe signature', async () => {
    const { controller, paymentAuditService } = buildController();

    await expect(controller.stripeLinkWebhook({ headers: {}, body: Buffer.from('') })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(paymentAuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'webhook_rejected',
        provider: 'stripe',
        reason: 'missing_signature',
      }),
      null,
    );
  });

  it('ignores duplicate stripe events after they were processed', async () => {
    const createWebhookEvent = jest.fn().mockResolvedValue({
      success: true,
      event: {
        id: 'evt_123',
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_test', payment_status: 'paid', metadata: {} } },
      },
    });
    const countDocuments = jest.fn().mockResolvedValue(1);

    const { controller, orderModel, processedWebhookEventModel, paymentAuditService } = buildController({
      createWebhookEvent,
      countDocuments,
    });

    await expect(
      controller.stripeLinkWebhook({
        headers: { 'stripe-signature': 'sig_test' },
        body: Buffer.from('{}'),
      }),
    ).resolves.toEqual({ received: true, duplicate: true });

    expect(orderModel.findOne).not.toHaveBeenCalled();
    expect(processedWebhookEventModel.updateOne).not.toHaveBeenCalled();
    expect(paymentAuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'duplicate_event_ignored',
        provider: 'stripe',
        eventId: 'evt_123',
      }),
      null,
    );
  });

  it('marks new verified stripe events as processed', async () => {
    const createWebhookEvent = jest.fn().mockResolvedValue({
      success: true,
      event: {
        id: 'evt_new',
        type: 'customer.subscription.updated',
        data: { object: {} },
      },
    });
    const updateOne = jest.fn().mockResolvedValue({});

    const { controller, processedWebhookEventModel } = buildController({
      createWebhookEvent,
      countDocuments: jest.fn().mockResolvedValue(0),
      updateOne,
    });

    await expect(
      controller.stripeLinkWebhook({
        headers: { 'stripe-signature': 'sig_test' },
        body: Buffer.from('{}'),
      }),
    ).resolves.toEqual({ received: true });

    expect(processedWebhookEventModel.updateOne).toHaveBeenCalledWith(
      { provider: 'stripe', eventId: 'evt_new' },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({
          provider: 'stripe',
          eventId: 'evt_new',
          eventType: 'customer.subscription.updated',
        }),
      }),
      { upsert: true },
    );
  });
});
