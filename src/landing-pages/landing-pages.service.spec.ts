import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { LandingPagesService } from './landing-pages.service';

// ── Mock helpers ─────────────────────────────────────────────────────────────

const makeLeanQuery = (value: any) => ({
  select: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  lean: jest.fn().mockReturnValue(value),
} as any);

/**
 * Creates a find-one mock that supports both `await model.findOne(q)` and
 * `model.findOne(q).lean()` call patterns.
 */
const makeFindOneResult = (value: any) => {
  const result: any = Promise.resolve(value);
  result.lean = jest.fn().mockResolvedValue(value);
  result.select = jest.fn().mockReturnValue(result);
  return result;
};

describe('LandingPagesService', () => {
  let service: LandingPagesService;
  let landingPageModel: any;
  let communityModel: any;

  const userId = new Types.ObjectId().toString();
  const communityId = new Types.ObjectId().toString();
  const pageId = new Types.ObjectId().toString();

  beforeEach(() => {
    landingPageModel = jest.fn().mockImplementation(function (this: any, data: any) {
      Object.assign(this, data);
      this._id = this._id || new Types.ObjectId();
      this.save = jest.fn().mockResolvedValue(this);
    });
    landingPageModel.findOne = jest.fn().mockReturnValue(makeFindOneResult(null));
    landingPageModel.findById = jest.fn().mockResolvedValue(null);
    landingPageModel.findByIdAndUpdate = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    landingPageModel.findOneAndDelete = jest.fn().mockResolvedValue(null);
    landingPageModel.updateMany = jest.fn().mockResolvedValue({ modifiedCount: 0 });
    landingPageModel.find = jest.fn().mockReturnValue(makeLeanQuery([]));
    landingPageModel.countDocuments = jest.fn().mockResolvedValue(0);

    communityModel = {};
    communityModel.findOne = jest.fn().mockResolvedValue(null);
    communityModel.findById = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    communityModel.findByIdAndUpdate = jest.fn().mockResolvedValue(null);
    communityModel.find = jest.fn().mockReturnValue(makeLeanQuery([]));
    communityModel.updateOne = jest.fn().mockResolvedValue({});

    service = new LandingPagesService(landingPageModel, communityModel);
  });

  // ─── Invariant Tests ───────────────────────────────────────────────────────

  describe('create() - invariants', () => {
    it('should reject community-home without communityId', async () => {
      await expect(
        service.create(userId, {
          title: 'Test Page',
          pageType: 'community-home',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject isPrimaryHome=true when pageType is not community-home', async () => {
      await expect(
        service.create(userId, {
          title: 'Test Page',
          pageType: 'standalone',
          isPrimaryHome: true,
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow community-home with communityId', async () => {
      landingPageModel.findOne.mockReturnValue(makeFindOneResult(null));
      const page = await service.create(userId, {
        title: 'My Community Page',
        pageType: 'community-home',
        communityId,
      } as any);
      expect(page.pageType).toBe('community-home');
      expect(page.communityId?.toString()).toBe(communityId);
    });

    it('should allow standalone without communityId', async () => {
      landingPageModel.findOne.mockReturnValue(makeFindOneResult(null));
      const page = await service.create(userId, {
        title: 'Standalone Page',
      } as any);
      expect(page.pageType).toBe('standalone');
      expect(page.isPrimaryHome).toBe(false);
    });
  });

  // ─── Publish - community-join block enforcement ──────────────────────────

  describe('publish() - community-join enforcement', () => {
    it('should auto-inject community-join if missing for community-home', async () => {
      const existingPage = {
        _id: new Types.ObjectId(pageId),
        creator: new Types.ObjectId(userId),
        pageType: 'community-home',
        communityId: new Types.ObjectId(communityId),
        blocks: [
          { type: 'hero', visible: true },
          { type: 'cta', visible: true },
        ],
        settings: {},
      };
      landingPageModel.findOne.mockReturnValue(makeFindOneResult(existingPage));
      landingPageModel.findByIdAndUpdate.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ ...existingPage, status: 'published' }),
      });

      await service.publish(pageId, userId, {});

      // Should have called findByIdAndUpdate twice: once for blocks, once for publish
      expect(landingPageModel.findByIdAndUpdate).toHaveBeenCalledWith(
        pageId,
        expect.objectContaining({
          $set: expect.objectContaining({ blocks: expect.any(Array) }),
        }),
      );

      // Verify the injected blocks array has community-join
      const blocksCall = landingPageModel.findByIdAndUpdate.mock.calls[0];
      const updatedBlocks = blocksCall[1].$set.blocks;
      expect(updatedBlocks.some((b: any) => b.type === 'community-join')).toBe(true);
    });

    it('should NOT alter blocks if community-join already exists', async () => {
      const existingPage = {
        _id: new Types.ObjectId(pageId),
        creator: new Types.ObjectId(userId),
        pageType: 'community-home',
        communityId: new Types.ObjectId(communityId),
        blocks: [
          { type: 'hero', visible: true },
          { type: 'community-join', visible: true },
          { type: 'cta', visible: true },
        ],
        settings: {},
      };
      landingPageModel.findOne.mockReturnValue(makeFindOneResult(existingPage));
      landingPageModel.findByIdAndUpdate.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ ...existingPage, status: 'published' }),
      });

      await service.publish(pageId, userId, {});

      // findByIdAndUpdate should be called exactly once (for publish), not for blocks
      expect(landingPageModel.findByIdAndUpdate).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Remove - homePageId cleanup ───────────────────────────────────────────

  describe('remove() - homePageId cleanup', () => {
    it('should clear homePageId when deleting a community-home page', async () => {
      const deletedPage = {
        _id: new Types.ObjectId(pageId),
        creator: new Types.ObjectId(userId),
        pageType: 'community-home',
        communityId: new Types.ObjectId(communityId),
      };
      landingPageModel.findOneAndDelete.mockResolvedValue(deletedPage);

      await service.remove(pageId, userId);

      expect(communityModel.updateOne).toHaveBeenCalledWith(
        { _id: deletedPage.communityId, homePageId: deletedPage._id },
        { $unset: { homePageId: 1 } },
      );
    });

    it('should NOT call updateOne for non-community-home pages', async () => {
      const deletedPage = {
        _id: new Types.ObjectId(pageId),
        creator: new Types.ObjectId(userId),
        pageType: 'standalone',
      };
      landingPageModel.findOneAndDelete.mockResolvedValue(deletedPage);

      await service.remove(pageId, userId);

      expect(communityModel.updateOne).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if page does not exist', async () => {
      landingPageModel.findOneAndDelete.mockResolvedValue(null);

      await expect(service.remove(pageId, userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── getCommunityHomePageBySlug - fallback behavior ────────────────────────

  describe('getCommunityHomePageBySlug()', () => {
    it('should return null if community not found', async () => {
      communityModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
      const result = await service.getCommunityHomePageBySlug('unknown');
      expect(result).toBeNull();
    });

    it('should use homePageId fast path when available', async () => {
      const community = {
        _id: new Types.ObjectId(communityId),
        slug: 'test-community',
        isActive: true,
        homePageId: new Types.ObjectId(pageId),
      };
      const page = {
        _id: new Types.ObjectId(pageId),
        status: 'published',
      };

      communityModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(community) });
      landingPageModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(page) });

      const result = await service.getCommunityHomePageBySlug('test-community');
      expect(result).not.toBeNull();
      expect(result!.page).toEqual(page);
      expect(result!.community).toEqual(community);
    });
  });
});

// ─── Migration Service Tests ─────────────────────────────────────────────────

import { CommunityHomeMigrationService } from './community-home-migration.service';

describe('CommunityHomeMigrationService', () => {
  let migrationService: CommunityHomeMigrationService;
  let landingPageModel: any;
  let pageContentModel: any;
  let communityModel: any;

  const communityId = new Types.ObjectId().toString();

  beforeEach(() => {
    landingPageModel = jest.fn().mockImplementation(function (this: any, data: any) {
      Object.assign(this, data);
      this._id = this._id || new Types.ObjectId();
      this.save = jest.fn().mockResolvedValue(this);
    });
    landingPageModel.findOne = jest.fn().mockReturnValue(makeFindOneResult(null));
    landingPageModel.countDocuments = jest.fn().mockResolvedValue(0);

    pageContentModel = {};
    pageContentModel.find = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
    pageContentModel.countDocuments = jest.fn().mockResolvedValue(0);

    communityModel = {};
    communityModel.findById = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    communityModel.findByIdAndUpdate = jest.fn().mockResolvedValue(null);
    communityModel.countDocuments = jest.fn().mockResolvedValue(0);

    migrationService = new CommunityHomeMigrationService(
      landingPageModel,
      pageContentModel,
      communityModel,
    );
  });

  describe('migrateAll() - dry-run mode', () => {
    it('should report status without writing when dryRun=true', async () => {
      const content = { community: new Types.ObjectId(communityId), hero: {}, isPublished: true };
      pageContentModel.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([content]) });
      communityModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: communityId,
          name: 'Test Community',
          slug: 'test-community',
          createur: new Types.ObjectId(),
        }),
      });

      const result = await migrationService.migrateAll(true);

      expect(result.dryRun).toBe(true);
      expect(result.total).toBe(1);
      expect(result.migrated).toBe(1);
      expect(result.details[0].action).toBe('would migrate');
      // In dry-run, no save should be called
      expect(landingPageModel).not.toHaveBeenCalled();
    });
  });

  describe('getMigrationStatus()', () => {
    it('should return correct counts', async () => {
      communityModel.countDocuments.mockResolvedValue(10);
      pageContentModel.countDocuments.mockResolvedValue(5);
      landingPageModel.countDocuments.mockResolvedValue(3);

      const status = await migrationService.getMigrationStatus();
      expect(status.totalCommunities).toBe(10);
      expect(status.withOldContent).toBe(5);
      expect(status.withNewHomePage).toBe(3);
      expect(status.needsMigration).toBe(2);
    });
  });
});
