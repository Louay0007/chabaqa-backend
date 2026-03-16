import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { AffiliatePayoutService } from '../affiliate-payout.service';
import { AffiliatePayoutRequest } from '../schemas/affiliate-payout-request.schema';
import { AffiliateConversion } from '../schemas/affiliate-conversion.schema';

describe('AffiliatePayoutService', () => {
  let service: AffiliatePayoutService;

  const partnerUserId = new Types.ObjectId();

  const mockPayoutModel: any = {
    create: jest.fn(),
    find: jest.fn(),
    findById: jest.fn(),
    aggregate: jest.fn(),
  };
  const mockConversionModel: any = {
    aggregate: jest.fn(),
    find: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AffiliatePayoutService,
        { provide: getModelToken(AffiliatePayoutRequest.name), useValue: mockPayoutModel },
        { provide: getModelToken(AffiliateConversion.name), useValue: mockConversionModel },
      ],
    }).compile();

    service = module.get<AffiliatePayoutService>(AffiliatePayoutService);
  });

  describe('getBalance', () => {
    it('should compute balance breakdown correctly', async () => {
      mockConversionModel.aggregate.mockResolvedValue([
        { _id: 'approved', total: 100 },
        { _id: 'pending', total: 50 },
        { _id: 'paid', total: 30 },
        { _id: 'reversed', total: 10 },
      ]);

      // Paid payouts
      mockPayoutModel.aggregate
        .mockResolvedValueOnce([{ total: 20 }])   // paid payouts
        .mockResolvedValueOnce([{ total: 15 }]);   // pending payouts

      const balance = await service.getBalance(partnerUserId.toString());

      // approved (100) + paid conversions (30) - paid payouts (20) - pending payouts (15) = 95
      expect(balance.approvedBalanceDT).toBe(95);
      expect(balance.pendingDT).toBe(50);
      expect(balance.paidDT).toBe(20);
      expect(balance.reversedDT).toBe(10);
    });

    it('should return 0 balance when no conversions', async () => {
      mockConversionModel.aggregate.mockResolvedValue([]);
      mockPayoutModel.aggregate
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const balance = await service.getBalance(partnerUserId.toString());

      expect(balance.approvedBalanceDT).toBe(0);
      expect(balance.pendingDT).toBe(0);
      expect(balance.paidDT).toBe(0);
      expect(balance.reversedDT).toBe(0);
    });
  });

  describe('requestPayout', () => {
    it('should reject payout below minimum', async () => {
      process.env.AFFILIATE_MIN_PAYOUT_DT = '50';
      await expect(
        service.requestPayout(partnerUserId.toString(), 10, 'bank_transfer'),
      ).rejects.toThrow('Minimum payout is 50 DT');
    });

    it('should reject payout exceeding approved balance', async () => {
      process.env.AFFILIATE_MIN_PAYOUT_DT = '1';

      // Mock getBalance to return low balance
      mockConversionModel.aggregate.mockResolvedValue([
        { _id: 'approved', total: 30 },
      ]);
      mockPayoutModel.aggregate
        .mockResolvedValueOnce([])  // paid
        .mockResolvedValueOnce([]); // pending

      await expect(
        service.requestPayout(partnerUserId.toString(), 50, 'bank_transfer'),
      ).rejects.toThrow('Insufficient balance');
    });
  });

  describe('markPayoutPaid', () => {
    it('should mark conversions as paid FIFO until payout amount covered', async () => {
      const payout: any = {
        _id: new Types.ObjectId(),
        partnerUserId,
        amountDT: 25,
        status: 'approved',
        save: jest.fn().mockReturnThis(),
      };
      mockPayoutModel.findById.mockResolvedValue(payout);

      const conv1 = { _id: new Types.ObjectId(), commissionDT: 10, status: 'approved', createdAt: new Date('2025-01-01'), save: jest.fn() };
      const conv2 = { _id: new Types.ObjectId(), commissionDT: 20, status: 'approved', createdAt: new Date('2025-01-15'), save: jest.fn() };
      mockConversionModel.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue([conv1, conv2]),
      });

      await service.markPayoutPaid(payout._id.toString());

      expect(conv1.status).toBe('paid');
      expect(conv1.save).toHaveBeenCalled();
      expect(conv2.status).toBe('paid');
      expect(conv2.save).toHaveBeenCalled();
      expect(payout.status).toBe('paid');
      expect(payout.processedAt).toBeDefined();
    });

    it('should reject marking non-approved payout as paid', async () => {
      const payout = {
        _id: new Types.ObjectId(),
        status: 'pending',
        save: jest.fn(),
      };
      mockPayoutModel.findById.mockResolvedValue(payout);

      await expect(
        service.markPayoutPaid(payout._id.toString()),
      ).rejects.toThrow('Cannot mark as paid');
    });
  });
});
