import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { FeeService } from '../fee.service';
import { Subscription } from '../../../schema/subscription.schema';
import { Plan, PlanTier } from '../../../schema/plan.schema';
import { Types } from 'mongoose';

describe('FeeService', () => {
  let service: FeeService;
  let mockSubModel: any;
  let mockPlanModel: any;

  beforeEach(async () => {
    mockSubModel = {
      findOne: jest.fn(),
    };

    mockPlanModel = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeeService,
        {
          provide: getModelToken(Subscription.name),
          useValue: mockSubModel,
        },
        {
          provide: getModelToken(Plan.name),
          useValue: mockPlanModel,
        },
      ],
    }).compile();

    service = module.get<FeeService>(FeeService);
  });

  describe('calculateForAmount', () => {
    const creatorId = new Types.ObjectId().toString();

    it('should calculate fees correctly for Starter plan (7.9%)', async () => {
      mockSubModel.findOne.mockResolvedValue({
        creatorId: new Types.ObjectId(creatorId),
        plan: PlanTier.STARTER,
      });

      mockPlanModel.findOne.mockResolvedValue({
        tier: PlanTier.STARTER,
        transactionFeePercent: 7.9,
        transactionFixedFeeDT: 0,
      });

      const result = await service.calculateForAmount(50, creatorId);

      // Customer pays: 50 DT
      expect(result.amountDT).toBe(50);
      
      // Platform fee: 50 * 0.079 = 3.95 DT
      expect(result.platformFeeDT).toBe(3.95);
      
      // Creator receives: 50 - 3.95 = 46.05 DT
      expect(result.creatorNetDT).toBe(46.05);
      
      // Verify: customer pays exactly the displayed price
      expect(result.amountDT).toBe(50); // NOT 50 + 3.95 = 53.95
    });

    it('should calculate fees correctly for Growth plan (4.9%)', async () => {
      mockSubModel.findOne.mockResolvedValue({
        creatorId: new Types.ObjectId(creatorId),
        plan: PlanTier.GROWTH,
      });

      mockPlanModel.findOne.mockResolvedValue({
        tier: PlanTier.GROWTH,
        transactionFeePercent: 4.9,
        transactionFixedFeeDT: 0,
      });

      const result = await service.calculateForAmount(100, creatorId);

      expect(result.amountDT).toBe(100);
      expect(result.platformFeeDT).toBe(4.9);
      expect(result.creatorNetDT).toBe(95.1);
    });

    it('should calculate fees correctly for Pro plan (2.9%)', async () => {
      mockSubModel.findOne.mockResolvedValue({
        creatorId: new Types.ObjectId(creatorId),
        plan: PlanTier.PRO,
      });

      mockPlanModel.findOne.mockResolvedValue({
        tier: PlanTier.PRO,
        transactionFeePercent: 2.9,
        transactionFixedFeeDT: 0,
      });

      const result = await service.calculateForAmount(200, creatorId);

      expect(result.amountDT).toBe(200);
      expect(result.platformFeeDT).toBe(5.8);
      expect(result.creatorNetDT).toBe(194.2);
    });

    it('should use default fees (9% + 0.5 DT) when creator has no subscription', async () => {
      mockSubModel.findOne.mockResolvedValue(null);

      const result = await service.calculateForAmount(50, creatorId);

      // Platform fee: (50 * 0.09) + 0.5 = 4.5 + 0.5 = 5 DT
      expect(result.platformFeeDT).toBe(5);
      
      // Creator receives: 50 - 5 = 45 DT
      expect(result.creatorNetDT).toBe(45);
      
      // Customer still pays exactly 50 DT
      expect(result.amountDT).toBe(50);
    });

    it('should handle fixed fees correctly', async () => {
      mockSubModel.findOne.mockResolvedValue({
        creatorId: new Types.ObjectId(creatorId),
        plan: PlanTier.STARTER,
      });

      mockPlanModel.findOne.mockResolvedValue({
        tier: PlanTier.STARTER,
        transactionFeePercent: 5,
        transactionFixedFeeDT: 1.5,
      });

      const result = await service.calculateForAmount(100, creatorId);

      // Platform fee: (100 * 0.05) + 1.5 = 5 + 1.5 = 6.5 DT
      expect(result.platformFeeDT).toBe(6.5);
      
      // Creator receives: 100 - 6.5 = 93.5 DT
      expect(result.creatorNetDT).toBe(93.5);
    });

    it('should ensure creator net is never negative', async () => {
      mockSubModel.findOne.mockResolvedValue({
        creatorId: new Types.ObjectId(creatorId),
        plan: PlanTier.STARTER,
      });

      mockPlanModel.findOne.mockResolvedValue({
        tier: PlanTier.STARTER,
        transactionFeePercent: 50,
        transactionFixedFeeDT: 10,
      });

      const result = await service.calculateForAmount(5, creatorId);

      // Platform fee would be: (5 * 0.5) + 10 = 12.5 DT
      // But creator net should be capped at 0
      expect(result.creatorNetDT).toBe(0);
      expect(result.creatorNetDT).toBeGreaterThanOrEqual(0);
    });

    it('should throw error for invalid amount', async () => {
      await expect(service.calculateForAmount(0, creatorId)).rejects.toThrow('Montant invalide');
      await expect(service.calculateForAmount(-10, creatorId)).rejects.toThrow('Montant invalide');
    });

    it('should verify the fee is deducted, not added', async () => {
      mockSubModel.findOne.mockResolvedValue({
        creatorId: new Types.ObjectId(creatorId),
        plan: PlanTier.STARTER,
      });

      mockPlanModel.findOne.mockResolvedValue({
        tier: PlanTier.STARTER,
        transactionFeePercent: 7.9,
        transactionFixedFeeDT: 0,
      });

      const customerPayment = 50;
      const result = await service.calculateForAmount(customerPayment, creatorId);

      // CRITICAL TEST: Verify customer pays exactly what they see
      expect(result.amountDT).toBe(customerPayment);
      
      // Verify the sum is correct: platform fee + creator net = customer payment
      expect(result.platformFeeDT + result.creatorNetDT).toBeCloseTo(customerPayment, 2);
      
      // Verify creator receives LESS than the payment (fee is deducted)
      expect(result.creatorNetDT).toBeLessThan(customerPayment);
      
      // Verify platform receives a portion
      expect(result.platformFeeDT).toBeGreaterThan(0);
      expect(result.platformFeeDT).toBeLessThan(customerPayment);
    });

    it('should handle decimal amounts correctly', async () => {
      mockSubModel.findOne.mockResolvedValue({
        creatorId: new Types.ObjectId(creatorId),
        plan: PlanTier.GROWTH,
      });

      mockPlanModel.findOne.mockResolvedValue({
        tier: PlanTier.GROWTH,
        transactionFeePercent: 4.9,
        transactionFixedFeeDT: 0,
      });

      const result = await service.calculateForAmount(37.50, creatorId);

      expect(result.amountDT).toBe(37.50);
      // 37.50 * 0.049 = 1.8375, rounded to 1.84
      expect(result.platformFeeDT).toBe(1.84);
      // 37.50 - 1.84 = 35.66
      expect(result.creatorNetDT).toBe(35.66);
    });
  });

  describe('Real-world scenarios', () => {
    const creatorId = new Types.ObjectId().toString();

    it('Scenario: 50 DT course with 20% promo code on Starter plan', async () => {
      mockSubModel.findOne.mockResolvedValue({
        creatorId: new Types.ObjectId(creatorId),
        plan: PlanTier.STARTER,
      });

      mockPlanModel.findOne.mockResolvedValue({
        tier: PlanTier.STARTER,
        transactionFeePercent: 7.9,
        transactionFixedFeeDT: 0,
      });

      // Original price: 50 DT
      // After 20% discount: 40 DT
      const finalAmount = 40;
      
      const result = await service.calculateForAmount(finalAmount, creatorId);

      // Customer pays: 40 DT (not 50, not 40 + fees)
      expect(result.amountDT).toBe(40);
      
      // Platform fee: 40 * 0.079 = 3.16 DT
      expect(result.platformFeeDT).toBe(3.16);
      
      // Creator receives: 40 - 3.16 = 36.84 DT
      expect(result.creatorNetDT).toBe(36.84);
    });

    it('Scenario: 100 DT event on Pro plan', async () => {
      mockSubModel.findOne.mockResolvedValue({
        creatorId: new Types.ObjectId(creatorId),
        plan: PlanTier.PRO,
      });

      mockPlanModel.findOne.mockResolvedValue({
        tier: PlanTier.PRO,
        transactionFeePercent: 2.9,
        transactionFixedFeeDT: 0,
      });

      const result = await service.calculateForAmount(100, creatorId);

      // Customer pays: 100 DT
      expect(result.amountDT).toBe(100);
      
      // Platform fee: 100 * 0.029 = 2.9 DT
      expect(result.platformFeeDT).toBe(2.9);
      
      // Creator receives: 100 - 2.9 = 97.1 DT (97.10 DT)
      expect(result.creatorNetDT).toBe(97.1);
    });
  });
});
