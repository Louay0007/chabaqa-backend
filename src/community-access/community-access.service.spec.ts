import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { CommunityAccessService } from './community-access.service';
import {
  CommunityRole,
  CommunityPermission,
  CommunityStaffRole,
  roleHasPermission,
  getPermissionsForRole,
  ROLE_HIERARCHY,
  ROLE_PERMISSIONS,
} from '../common/permissions';

// ── Helpers ────────────────────────────────────────────────────────────────

const oid = () => new Types.ObjectId();

const makeLeanExec = (value: any) => ({
  select: jest.fn().mockReturnThis(),
  populate: jest.fn().mockReturnThis(),
  lean: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue(value),
});

const makeFindChain = (value: any[]) => {
  const chain: any = {
    exec: jest.fn().mockResolvedValue(value),
  };
  chain.populate = jest.fn().mockReturnValue(chain);
  chain.lean = jest.fn().mockReturnValue(chain);
  chain.sort = jest.fn().mockReturnValue(chain);
  return chain;
};

function buildService(opts: {
  community?: any;
  staffRecord?: any;
  staffList?: any[];
}) {
  const communityModel: any = {
    findById: jest.fn().mockImplementation(() => makeLeanExec(opts.community ?? null)),
    findOne: jest.fn().mockImplementation(() => makeLeanExec(opts.community ?? null)),
  };

  const staffModel: any = jest.fn().mockImplementation(function (this: any, data: any) {
    Object.assign(this, data);
    this._id = this._id || oid();
    this.save = jest.fn().mockResolvedValue(this);
  });
  staffModel.findOne = jest.fn().mockImplementation(() => makeLeanExec(opts.staffRecord ?? null));
  staffModel.find = jest.fn().mockImplementation(() => makeFindChain(opts.staffList ?? []));
  staffModel.findOneAndUpdate = jest.fn().mockImplementation(() => makeLeanExec(opts.staffRecord));
  staffModel.findOneAndDelete = jest.fn().mockImplementation(() => makeLeanExec(opts.staffRecord));
  staffModel.deleteOne = jest.fn().mockResolvedValue({ deletedCount: 1 });

  const service = new CommunityAccessService(communityModel, staffModel);

  // Clear the internal cache before each use
  (service as any).roleCache.clear();

  return { service, communityModel, staffModel };
}

// ── Constants tests ────────────────────────────────────────────────────────

describe('community-roles.constants', () => {
  it('owner has every permission', () => {
    const all = Object.values(CommunityPermission);
    for (const perm of all) {
      expect(roleHasPermission(CommunityRole.OWNER, perm)).toBe(true);
    }
  });

  it('admin has every permission', () => {
    const all = Object.values(CommunityPermission);
    for (const perm of all) {
      expect(roleHasPermission(CommunityRole.ADMIN, perm)).toBe(true);
    }
  });

  it('moderator has MEMBERS_VIEW and POSTS_MODERATE only', () => {
    expect(roleHasPermission(CommunityRole.MODERATOR, CommunityPermission.MEMBERS_VIEW)).toBe(true);
    expect(roleHasPermission(CommunityRole.MODERATOR, CommunityPermission.POSTS_MODERATE)).toBe(true);
    expect(roleHasPermission(CommunityRole.MODERATOR, CommunityPermission.FINANCE_VIEW)).toBe(false);
    expect(roleHasPermission(CommunityRole.MODERATOR, CommunityPermission.MARKETING_MANAGE)).toBe(false);
  });

  it('support has MEMBERS_VIEW and SUPPORT_MANAGE only', () => {
    expect(roleHasPermission(CommunityRole.SUPPORT, CommunityPermission.MEMBERS_VIEW)).toBe(true);
    expect(roleHasPermission(CommunityRole.SUPPORT, CommunityPermission.SUPPORT_MANAGE)).toBe(true);
    expect(roleHasPermission(CommunityRole.SUPPORT, CommunityPermission.CONTENT_MANAGE)).toBe(false);
  });

  it('member and none have zero permissions', () => {
    expect(ROLE_PERMISSIONS[CommunityRole.MEMBER]).toEqual([]);
    expect(ROLE_PERMISSIONS[CommunityRole.NONE]).toEqual([]);
  });

  it('getPermissionsForRole returns boolean map', () => {
    const map = getPermissionsForRole(CommunityRole.MODERATOR);
    expect(map[CommunityPermission.POSTS_MODERATE]).toBe(true);
    expect(map[CommunityPermission.FINANCE_VIEW]).toBe(false);
  });

  it('role hierarchy is ordered correctly', () => {
    expect(ROLE_HIERARCHY[CommunityRole.OWNER]).toBeGreaterThan(ROLE_HIERARCHY[CommunityRole.ADMIN]);
    expect(ROLE_HIERARCHY[CommunityRole.ADMIN]).toBeGreaterThan(ROLE_HIERARCHY[CommunityRole.MODERATOR]);
    expect(ROLE_HIERARCHY[CommunityRole.MODERATOR]).toBeGreaterThan(ROLE_HIERARCHY[CommunityRole.SUPPORT]);
    expect(ROLE_HIERARCHY[CommunityRole.SUPPORT]).toBeGreaterThan(ROLE_HIERARCHY[CommunityRole.MEMBER]);
    expect(ROLE_HIERARCHY[CommunityRole.MEMBER]).toBeGreaterThan(ROLE_HIERARCHY[CommunityRole.NONE]);
  });
});

// ── CommunityAccessService.getCommunityRole ────────────────────────────────

describe('CommunityAccessService', () => {
  const communityId = oid();
  const ownerId = oid();
  const adminId = oid();
  const modId = oid();
  const supportId = oid();
  const memberId = oid();
  const outsiderId = oid();

  describe('getCommunityRole', () => {
    const baseCommunity = {
      _id: communityId,
      createur: ownerId,
      members: [ownerId, adminId, modId, memberId],
      admins: [adminId],
      moderateurs: [modId],
    };

    it('returns OWNER for community creator', async () => {
      const { service } = buildService({ community: baseCommunity });
      const role = await service.getCommunityRole(communityId, ownerId);
      expect(role).toBe(CommunityRole.OWNER);
    });

    it('returns ADMIN for user with admin staff record', async () => {
      const { service } = buildService({
        community: baseCommunity,
        staffRecord: { communityId, userId: adminId, role: CommunityStaffRole.ADMIN, status: 'active' },
      });
      const role = await service.getCommunityRole(communityId, adminId);
      expect(role).toBe(CommunityRole.ADMIN);
    });

    it('returns MODERATOR for user with moderator staff record', async () => {
      const { service } = buildService({
        community: baseCommunity,
        staffRecord: { communityId, userId: modId, role: CommunityStaffRole.MODERATOR, status: 'active' },
      });
      const role = await service.getCommunityRole(communityId, modId);
      expect(role).toBe(CommunityRole.MODERATOR);
    });

    it('returns SUPPORT for user with support staff record', async () => {
      const { service } = buildService({
        community: baseCommunity,
        staffRecord: { communityId, userId: supportId, role: CommunityStaffRole.SUPPORT, status: 'active' },
      });
      const role = await service.getCommunityRole(communityId, supportId);
      expect(role).toBe(CommunityRole.SUPPORT);
    });

    it('falls back to legacy admins array when no staff record exists', async () => {
      const { service } = buildService({ community: baseCommunity });
      const role = await service.getCommunityRole(communityId, adminId);
      expect(role).toBe(CommunityRole.ADMIN);
    });

    it('falls back to legacy moderateurs array when no staff record exists', async () => {
      const { service } = buildService({ community: baseCommunity });
      const role = await service.getCommunityRole(communityId, modId);
      expect(role).toBe(CommunityRole.MODERATOR);
    });

    it('returns MEMBER for a user in the members array', async () => {
      const { service } = buildService({ community: baseCommunity });
      const role = await service.getCommunityRole(communityId, memberId);
      expect(role).toBe(CommunityRole.MEMBER);
    });

    it('returns NONE for a user not in the community', async () => {
      const { service } = buildService({ community: baseCommunity });
      const role = await service.getCommunityRole(communityId, outsiderId);
      expect(role).toBe(CommunityRole.NONE);
    });

    it('returns NONE when community does not exist', async () => {
      const { service } = buildService({ community: null });
      const role = await service.getCommunityRole(oid(), oid());
      expect(role).toBe(CommunityRole.NONE);
    });

    it('caches the result on subsequent calls', async () => {
      const { service, communityModel } = buildService({ community: baseCommunity });
      await service.getCommunityRole(communityId, ownerId);
      await service.getCommunityRole(communityId, ownerId);
      // findById should only be called once thanks to cache
      expect(communityModel.findById).toHaveBeenCalledTimes(1);
    });
  });

  // ── getCommunityPermissions ──────────────────────────────────────────────

  describe('getCommunityPermissions', () => {
    it('returns full permissions map for owner', async () => {
      const community = {
        _id: communityId,
        createur: ownerId,
        members: [ownerId],
        admins: [],
        moderateurs: [],
      };
      const { service } = buildService({ community });
      const result = await service.getCommunityPermissions(communityId, ownerId);
      expect(result.role).toBe(CommunityRole.OWNER);
      expect(result.permissions[CommunityPermission.FINANCE_VIEW]).toBe(true);
      expect(result.permissions[CommunityPermission.MARKETING_MANAGE]).toBe(true);
    });

    it('returns no permissions for plain member', async () => {
      const community = {
        _id: communityId,
        createur: ownerId,
        members: [ownerId, memberId],
        admins: [],
        moderateurs: [],
      };
      const { service } = buildService({ community });
      const result = await service.getCommunityPermissions(communityId, memberId);
      expect(result.role).toBe(CommunityRole.MEMBER);
      for (const perm of Object.values(CommunityPermission)) {
        expect(result.permissions[perm]).toBe(false);
      }
    });
  });

  // ── assertPermission ─────────────────────────────────────────────────────

  describe('assertPermission', () => {
    const community = {
      _id: communityId,
      createur: ownerId,
      members: [ownerId, memberId],
      admins: [],
      moderateurs: [],
    };

    it('does not throw when the user has the permission', async () => {
      const { service } = buildService({ community });
      await expect(
        service.assertPermission(communityId, ownerId, CommunityPermission.FINANCE_VIEW),
      ).resolves.toBe(CommunityRole.OWNER);
    });

    it('throws ForbiddenException when missing permission', async () => {
      const { service } = buildService({ community });
      await expect(
        service.assertPermission(communityId, memberId, CommunityPermission.FINANCE_VIEW),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── assertMinimumRole ────────────────────────────────────────────────────

  describe('assertMinimumRole', () => {
    const community = {
      _id: communityId,
      createur: ownerId,
      members: [ownerId, memberId],
      admins: [],
      moderateurs: [],
    };

    it('passes when role is sufficient', async () => {
      const { service } = buildService({ community });
      await expect(
        service.assertMinimumRole(communityId, ownerId, CommunityRole.ADMIN),
      ).resolves.toBe(CommunityRole.OWNER);
    });

    it('throws when role is insufficient', async () => {
      const { service } = buildService({ community });
      await expect(
        service.assertMinimumRole(communityId, memberId, CommunityRole.MODERATOR),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
