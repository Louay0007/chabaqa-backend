import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { AffiliateCommissionService } from '../affiliate-commission.service';
import { AffiliateConversion } from '../schemas/affiliate-conversion.schema';
import { AffiliateClick } from '../schemas/affiliate-click.schema';
import { AffiliateLink } from '../schemas/affiliate-link.schema';
import { AffiliateProgram } from '../schemas/affiliate-program.schema';
import { AffiliatePartner } from '../schemas/affiliate-partner.schema';

describe('AffiliateCommissionService', () => {
  let service: AffiliateCommissionService;

  const mockConversionModel = {
    findOne: jest.fn(),
    create: jest.fn(),
    find: jest.fn(),
  };
  const mockClickModel = { findOne: jest.fn() };
  const mockLinkModel = { findOne: jest.fn() };
  const mockProgramModel = { findById: jest.fn() };
  const mockPartnerModel = { findOne: jest.fn() };
  const mockOrderModel = { findById: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AffiliateCommissionService,
        { provide: getModelToken(AffiliateConversion.name), useValue: mockConversionModel },
        { provide: getModelToken(AffiliateClick.name), useValue: mockClickModel },
        { provide: getModelToken(AffiliateLink.name), useValue: mockLinkModel },
        { provide: getModelToken(AffiliateProgram.name), useValue: mockProgramModel },
        { provide: getModelToken(AffiliatePartner.name), useValue: mockPartnerModel },
        { provide: getModelToken('Order'), useValue: mockOrderModel },
      ],
    }).compile();

    service = module.get<AffiliateCommissionService>(AffiliateCommissionService);
  });

  const programId = new Types.ObjectId();
  const partnerUserId = new Types.ObjectId();
  const buyerId = new Types.ObjectId();
  const creatorId = new Types.ObjectId();
  const orderId = new Types.ObjectId();

  const makeOrder = (overrides: any = {}) => ({
    _id: orderId,
    status: 'paid',
    buyerId,
    creatorId,
    contentType: 'course',
    contentId: 'c1',
    amountDT: 100,
    creatorNetDT: 90,
    communityId: null,
    metadata: { affiliateClickId: 'click-1' },
    ...overrides,
  });

  const makeClick = (overrides: any = {}) => ({
    clickId: 'click-1',
    programId,
    partnerUserId,
    linkCode: 'ABCD1234',
    createdAt: new Date(),
    ...overrides,
  });

  const makeProgram = (overrides: any = {}) => ({
    _id: programId,
    status: 'active',
    commissionPercent: 20,
    cookieWindowDays: 30,
    holdDays: 14,
    ...overrides,
  });

  const makePartner = (overrides: any = {}) => ({
    programId,
    partnerUserId,
    status: 'approved',
    ...overrides,
  });

  // ── Commission calculation ──

  it('should compute commission correctly from creatorNetDT', async () => {
    const order = makeOrder({ creatorNetDT: 90 });
    const program = makeProgram({ commissionPercent: 20 });

    mockConversionModel.findOne.mockResolvedValue(null);
    mockClickModel.findOne.mockResolvedValue(makeClick());
    mockLinkModel.findOne.mockResolvedValue({ code: 'ABCD1234', programId, partnerUserId });
    mockProgramModel.findById.mockResolvedValue(program);
    mockPartnerModel.findOne.mockResolvedValue(makePartner());
    mockConversionModel.create.mockImplementation((data) => Promise.resolve({ _id: new Types.ObjectId(), ...data }));

    const result = await service.onOrderPaid(order);

    expect(result).toBeTruthy();
    expect(mockConversionModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        commissionDT: 18, // 90 * 20 / 100 = 18
        status: 'pending',
      }),
    );
  });

  it('should compute commission with rounding for odd percentages', async () => {
    const order = makeOrder({ creatorNetDT: 73 });
    const program = makeProgram({ commissionPercent: 15 });

    mockConversionModel.findOne.mockResolvedValue(null);
    mockClickModel.findOne.mockResolvedValue(makeClick());
    mockLinkModel.findOne.mockResolvedValue({ code: 'ABCD1234', programId, partnerUserId });
    mockProgramModel.findById.mockResolvedValue(program);
    mockPartnerModel.findOne.mockResolvedValue(makePartner());
    mockConversionModel.create.mockImplementation((data) => Promise.resolve({ _id: new Types.ObjectId(), ...data }));

    await service.onOrderPaid(order);

    // 73 * 15 / 100 = 10.95 → Math.round(73 * 15) / 100 = 10.95
    expect(mockConversionModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        commissionDT: 10.95,
      }),
    );
  });

  // ── Idempotency ──

  it('should return existing conversion if order paid twice', async () => {
    const existingConversion = { _id: new Types.ObjectId(), orderId, commissionDT: 18 };
    mockConversionModel.findOne.mockResolvedValue(existingConversion);

    const result = await service.onOrderPaid(makeOrder());

    expect(result).toBe(existingConversion);
    expect(mockConversionModel.create).not.toHaveBeenCalled();
  });

  it('should handle duplicate key error gracefully', async () => {
    const order = makeOrder();
    const existingConversion = { _id: new Types.ObjectId(), orderId };

    mockConversionModel.findOne
      .mockResolvedValueOnce(null) // first check: no duplicate
      .mockResolvedValueOnce(existingConversion); // lookup after DuplicateKeyError
    mockClickModel.findOne.mockResolvedValue(makeClick());
    mockLinkModel.findOne.mockResolvedValue({ code: 'ABCD1234', programId, partnerUserId });
    mockProgramModel.findById.mockResolvedValue(makeProgram());
    mockPartnerModel.findOne.mockResolvedValue(makePartner());

    const duplicateError: any = new Error('E11000 duplicate key');
    duplicateError.code = 11000;
    mockConversionModel.create.mockRejectedValue(duplicateError);

    const result = await service.onOrderPaid(order);
    expect(result).toBe(existingConversion);
  });

  // ── Self-referral rejection ──

  it('should reject self-referral (buyer === partner)', async () => {
    const order = makeOrder({ buyerId: partnerUserId });

    mockConversionModel.findOne.mockResolvedValue(null);
    mockClickModel.findOne.mockResolvedValue(makeClick());
    mockLinkModel.findOne.mockResolvedValue({ code: 'ABCD1234', programId, partnerUserId });
    mockProgramModel.findById.mockResolvedValue(makeProgram());
    mockPartnerModel.findOne.mockResolvedValue(makePartner());

    const result = await service.onOrderPaid(order);

    expect(result).toBeNull();
    expect(mockConversionModel.create).not.toHaveBeenCalled();
  });

  // ── Click window expired ──

  it('should reject expired click (past cookie window)', async () => {
    const order = makeOrder();
    const oldClick = makeClick({
      createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000), // 31 days ago
    });

    mockConversionModel.findOne.mockResolvedValue(null);
    mockClickModel.findOne.mockResolvedValue(oldClick);
    mockLinkModel.findOne.mockResolvedValue({ code: 'ABCD1234', programId, partnerUserId });
    mockProgramModel.findById.mockResolvedValue(makeProgram({ cookieWindowDays: 30 }));
    mockPartnerModel.findOne.mockResolvedValue(makePartner());

    const result = await service.onOrderPaid(order);

    expect(result).toBeNull();
    expect(mockConversionModel.create).not.toHaveBeenCalled();
  });

  // ── Order without affiliate attribution ──

  it('should return null if order has no affiliateClickId', async () => {
    const order = makeOrder({ metadata: {} });
    const result = await service.onOrderPaid(order);

    expect(result).toBeNull();
    expect(mockConversionModel.findOne).not.toHaveBeenCalled();
  });

  // ── Inactive program ──

  it('should return null if program is paused', async () => {
    const order = makeOrder();

    mockConversionModel.findOne.mockResolvedValue(null);
    mockClickModel.findOne.mockResolvedValue(makeClick());
    mockLinkModel.findOne.mockResolvedValue({ code: 'ABCD1234', programId, partnerUserId });
    mockProgramModel.findById.mockResolvedValue(makeProgram({ status: 'paused' }));

    const result = await service.onOrderPaid(order);

    expect(result).toBeNull();
    expect(mockConversionModel.create).not.toHaveBeenCalled();
  });

  // ── Unapproved partner ──

  it('should return null if partner is not approved', async () => {
    const order = makeOrder();

    mockConversionModel.findOne.mockResolvedValue(null);
    mockClickModel.findOne.mockResolvedValue(makeClick());
    mockLinkModel.findOne.mockResolvedValue({ code: 'ABCD1234', programId, partnerUserId });
    mockProgramModel.findById.mockResolvedValue(makeProgram());
    mockPartnerModel.findOne.mockResolvedValue(null);

    const result = await service.onOrderPaid(order);

    expect(result).toBeNull();
    expect(mockConversionModel.create).not.toHaveBeenCalled();
  });

  // ── Refund reversal ──

  it('should reverse pending conversion on refund', async () => {
    const conversion: any = {
      _id: new Types.ObjectId(),
      orderId,
      status: 'pending',
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockConversionModel.findOne.mockResolvedValue(conversion);

    const result = await service.onOrderRefunded(orderId.toString());

    expect(result).toBeTruthy();
    expect(conversion.status).toBe('reversed');
    expect(conversion.reason).toBe('order_refunded');
    expect(conversion.save).toHaveBeenCalled();
  });

  it('should reverse approved conversion on refund', async () => {
    const conversion: any = {
      _id: new Types.ObjectId(),
      orderId,
      status: 'approved',
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockConversionModel.findOne.mockResolvedValue(conversion);

    const result = await service.onOrderRefunded(orderId.toString());

    expect(result).toBeTruthy();
    expect(conversion.status).toBe('reversed');
  });

  it('should return null if no conversion to reverse on refund', async () => {
    mockConversionModel.findOne.mockResolvedValue(null);

    const result = await service.onOrderRefunded(orderId.toString());
    expect(result).toBeNull();
  });
});
