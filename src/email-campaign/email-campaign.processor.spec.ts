import { EmailCampaignProcessor } from './email-campaign.processor';

describe('EmailCampaignProcessor', () => {
  it('delegates send jobs and clears payload on success', async () => {
    const queueService = {
      clearJob: jest.fn().mockResolvedValue(undefined),
      queueCampaignSend: jest.fn().mockResolvedValue(undefined),
    } as any;
    const service = {
      executeSendCampaignJob: jest.fn().mockResolvedValue(undefined),
      markCampaignSendFailed: jest.fn().mockResolvedValue(undefined),
    } as any;
    const processor = new EmailCampaignProcessor(queueService, service);

    await processor.process({
      campaignId: 'campaign-id',
      requestedBy: 'creator-id',
      trigger: 'manual',
    } as any);

    expect(service.executeSendCampaignJob).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId: 'campaign-id' }),
    );
    expect(queueService.clearJob).toHaveBeenCalledWith('campaign-id');
  });

  it('requeues with backoff when processing fails before max attempts', async () => {
    const queueService = {
      clearJob: jest.fn().mockResolvedValue(undefined),
      queueCampaignSend: jest.fn().mockResolvedValue(undefined),
    } as any;
    const service = {
      executeSendCampaignJob: jest.fn().mockRejectedValue(new Error('smtp temporary failure')),
      markCampaignSendFailed: jest.fn().mockResolvedValue(undefined),
    } as any;
    const processor = new EmailCampaignProcessor(queueService, service);

    await processor.process({ campaignId: 'campaign-id', requestedBy: 'creator-id', trigger: 'manual' } as any);

    expect(service.executeSendCampaignJob).toHaveBeenCalledTimes(1);
    expect(queueService.queueCampaignSend).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: 'campaign-id',
        requestedBy: 'creator-id',
        trigger: 'retry',
        attempt: 1,
      }),
      expect.any(Date),
    );
    expect(queueService.clearJob).not.toHaveBeenCalled();
    expect(service.markCampaignSendFailed).not.toHaveBeenCalled();
  });

  it('marks campaign failed and clears payload after max attempts', async () => {
    const queueService = {
      clearJob: jest.fn().mockResolvedValue(undefined),
      queueCampaignSend: jest.fn().mockResolvedValue(undefined),
    } as any;
    const service = {
      executeSendCampaignJob: jest.fn().mockRejectedValue(new Error('smtp permanent failure')),
      markCampaignSendFailed: jest.fn().mockResolvedValue(undefined),
    } as any;
    const processor = new EmailCampaignProcessor(queueService, service);

    await processor.process({
      campaignId: 'campaign-id',
      requestedBy: 'creator-id',
      trigger: 'retry',
      attempt: 2,
    } as any);

    expect(service.markCampaignSendFailed).toHaveBeenCalledWith(
      'campaign-id',
      expect.stringContaining('smtp permanent failure'),
    );
    expect(queueService.queueCampaignSend).not.toHaveBeenCalled();
    expect(queueService.clearJob).toHaveBeenCalledWith('campaign-id');
  });
});
