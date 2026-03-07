import { SubscriptionController } from './subscription.controller';

describe('SubscriptionController webhook hardening', () => {
  it('rejects the deprecated unsigned webhook endpoint', async () => {
    const controller = new SubscriptionController({} as any);

    await expect(
      controller.handleWebhook({
        id: 'evt_legacy',
        type: 'subscription.created',
        data: { object: {} },
      } as any),
    ).resolves.toEqual({
      message: 'Unsigned webhook payloads are no longer accepted. Use a provider-specific signed webhook endpoint.',
      eventId: 'evt_legacy',
      status: 'skipped',
    });
  });
});
