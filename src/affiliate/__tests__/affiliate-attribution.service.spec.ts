import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { AffiliateAttributionService } from '../affiliate-attribution.service';
import { AffiliateClick } from '../schemas/affiliate-click.schema';
import { AffiliateLink } from '../schemas/affiliate-link.schema';
import { AffiliateProgram } from '../schemas/affiliate-program.schema';
import { AffiliatePartner } from '../schemas/affiliate-partner.schema';

describe('AffiliateAttributionService', () => {
  let service: AffiliateAttributionService;

  const mockClickModel = { create: jest.fn(), findOne: jest.fn() };
  const mockLinkModel = { findOne: jest.fn() };
  const mockProgramModel = { findById: jest.fn() };
  const mockPartnerModel = { findOne: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.AFFILIATE_COOKIE_NAME = 'chabaqa_aff_click';
    process.env.AFFILIATE_IP_HASH_SALT = 'test-salt';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AffiliateAttributionService,
        { provide: getModelToken(AffiliateClick.name), useValue: mockClickModel },
        { provide: getModelToken(AffiliateLink.name), useValue: mockLinkModel },
        { provide: getModelToken(AffiliateProgram.name), useValue: mockProgramModel },
        { provide: getModelToken(AffiliatePartner.name), useValue: mockPartnerModel },
      ],
    }).compile();

    service = module.get<AffiliateAttributionService>(AffiliateAttributionService);
  });

  describe('resolveAttributionFromRequest', () => {
    it('should resolve clickId from cookie', () => {
      const req = { cookies: { chabaqa_aff_click: 'click-abc' }, headers: {} };
      expect(service.resolveAttributionFromRequest(req)).toEqual({ clickId: 'click-abc' });
    });

    it('should resolve clickId from x-aff-click header', () => {
      const req = { cookies: {}, headers: { 'x-aff-click': 'click-xyz' } };
      expect(service.resolveAttributionFromRequest(req)).toEqual({ clickId: 'click-xyz' });
    });

    it('should prefer cookie over header', () => {
      const req = { cookies: { chabaqa_aff_click: 'cookie-val' }, headers: { 'x-aff-click': 'header-val' } };
      expect(service.resolveAttributionFromRequest(req)).toEqual({ clickId: 'cookie-val' });
    });

    it('should return empty object if no attribution', () => {
      const req = { cookies: {}, headers: {} };
      expect(service.resolveAttributionFromRequest(req)).toEqual({});
    });
  });

  describe('recordClick', () => {
    const programId = new Types.ObjectId();
    const partnerUserId = new Types.ObjectId();

    it('should return null for invalid code', async () => {
      mockLinkModel.findOne.mockResolvedValue(null);
      const result = await service.recordClick('INVALID', { ip: '1.2.3.4' });
      expect(result).toBeNull();
    });

    it('should return null for paused program', async () => {
      mockLinkModel.findOne.mockResolvedValue({ code: 'ABC', programId, partnerUserId });
      mockProgramModel.findById.mockResolvedValue({ _id: programId, status: 'paused' });

      const result = await service.recordClick('ABC', { ip: '1.2.3.4' });
      expect(result).toBeNull();
    });

    it('should return null for unapproved partner', async () => {
      mockLinkModel.findOne.mockResolvedValue({ code: 'ABC', programId, partnerUserId });
      mockProgramModel.findById.mockResolvedValue({ _id: programId, status: 'active' });
      mockPartnerModel.findOne.mockResolvedValue(null);

      const result = await service.recordClick('ABC', { ip: '1.2.3.4' });
      expect(result).toBeNull();
    });

    it('should create click and return data for valid link', async () => {
      const link = { code: 'ABC', programId, partnerUserId, targetPath: '/en/community/test' };
      const program = { _id: programId, status: 'active', cookieWindowDays: 30 };
      const partner = { programId, partnerUserId, status: 'approved' };
      const click = { clickId: 'uuid-123', programId, partnerUserId };

      mockLinkModel.findOne.mockResolvedValue(link);
      mockProgramModel.findById.mockResolvedValue(program);
      mockPartnerModel.findOne.mockResolvedValue(partner);
      mockClickModel.create.mockResolvedValue(click);

      const result = await service.recordClick('ABC', {
        ip: '1.2.3.4',
        userAgent: 'Mozilla/5.0',
        referrer: 'https://google.com',
      });

      expect(result).toBeTruthy();
      expect(result!.click).toBe(click);
      expect(result!.link).toBe(link);
      expect(result!.program).toBe(program);
      expect(mockClickModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          linkCode: 'ABC',
          programId,
          partnerUserId,
        }),
      );
    });
  });

  describe('getCookieConfig', () => {
    it('should return secure cookie config in production', () => {
      process.env.NODE_ENV = 'production';
      const config = service.getCookieConfig(30);

      expect(config.name).toBe('chabaqa_aff_click');
      expect(config.options.httpOnly).toBe(true);
      expect(config.options.sameSite).toBe('lax');
      expect(config.options.secure).toBe(true);
      expect(config.options.maxAge).toBe(30 * 24 * 60 * 60 * 1000);
    });

    it('should return non-secure cookie config in development', () => {
      process.env.NODE_ENV = 'development';
      const config = service.getCookieConfig(7);

      expect(config.options.secure).toBe(false);
      expect(config.options.maxAge).toBe(7 * 24 * 60 * 60 * 1000);
    });
  });
});
