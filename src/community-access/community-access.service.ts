import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Community, CommunityDocument } from '../schema/community.schema';
import {
  CommunityStaff,
  CommunityStaffDocument,
} from '../schema/community-staff.schema';
import {
  CommunityRole,
  CommunityPermission,
  CommunityStaffRole,
  getPermissionsForRole,
  roleHasPermission,
  ROLE_HIERARCHY,
  ROLE_LABELS,
} from '../common/permissions';

interface RoleCacheEntry {
  role: CommunityRole;
  ts: number;
}

const CACHE_TTL_MS = 45_000; // 45 seconds

@Injectable()
export class CommunityAccessService {
  private readonly logger = new Logger(CommunityAccessService.name);

  /** Simple in-memory cache keyed by `communityId:userId` */
  private roleCache = new Map<string, RoleCacheEntry>();

  constructor(
    @InjectModel(Community.name)
    private readonly communityModel: Model<CommunityDocument>,
    @InjectModel(CommunityStaff.name)
    private readonly staffModel: Model<CommunityStaffDocument>,
  ) {}

  // ───────────────────────────────────────────────────────────────────────
  // Role resolution
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Resolve a user's effective role within a community.
   *
   * Priority:
   *  1. Owner  – community.createur matches userId
   *  2. Staff  – community_staff record (admin / moderator / support)
   *  3. Member – userId in community.members (or legacy admins/moderateurs)
   *  4. None
   */
  async getCommunityRole(
    communityId: string | Types.ObjectId,
    userId: string | Types.ObjectId,
  ): Promise<CommunityRole> {
    const cKey = `${communityId}:${userId}`;
    const cached = this.roleCache.get(cKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return cached.role;
    }

    const communityOid =
      communityId instanceof Types.ObjectId
        ? communityId
        : new Types.ObjectId(String(communityId));
    const userOid =
      userId instanceof Types.ObjectId
        ? userId
        : new Types.ObjectId(String(userId));

    // Fetch community (only fields we need)
    const community = await this.communityModel
      .findById(communityOid)
      .select('createur members admins moderateurs')
      .lean()
      .exec();

    if (!community) {
      this.setCache(cKey, CommunityRole.NONE);
      return CommunityRole.NONE;
    }

    // 1. Owner
    if (community.createur && community.createur.equals(userOid)) {
      this.setCache(cKey, CommunityRole.OWNER);
      return CommunityRole.OWNER;
    }

    // 2. Staff record (new system)
    const staffRecord = await this.staffModel
      .findOne({
        communityId: communityOid,
        userId: userOid,
        status: 'active',
      })
      .lean()
      .exec();

    if (staffRecord) {
      const role = this.staffRoleToCommunityRole(staffRecord.role);
      this.setCache(cKey, role);
      return role;
    }

    // 2b. Backward compatibility: check legacy arrays when no staff record
    if (this.hasOid(community.admins, userOid)) {
      this.setCache(cKey, CommunityRole.ADMIN);
      return CommunityRole.ADMIN;
    }
    if (this.hasOid(community.moderateurs, userOid)) {
      this.setCache(cKey, CommunityRole.MODERATOR);
      return CommunityRole.MODERATOR;
    }

    // 3. Member
    if (this.hasOid(community.members, userOid)) {
      this.setCache(cKey, CommunityRole.MEMBER);
      return CommunityRole.MEMBER;
    }

    // 4. None
    this.setCache(cKey, CommunityRole.NONE);
    return CommunityRole.NONE;
  }

  /**
   * Return a boolean permissions map for a user in a community.
   */
  async getCommunityPermissions(
    communityId: string | Types.ObjectId,
    userId: string | Types.ObjectId,
  ): Promise<{ role: CommunityRole; permissions: Record<CommunityPermission, boolean> }> {
    const role = await this.getCommunityRole(communityId, userId);
    return {
      role,
      permissions: getPermissionsForRole(role),
    };
  }

  /**
   * Assert a user has a specific permission in a community.
   * Throws ForbiddenException if not.
   */
  async assertPermission(
    communityId: string | Types.ObjectId,
    userId: string | Types.ObjectId,
    permission: CommunityPermission,
  ): Promise<CommunityRole> {
    const role = await this.getCommunityRole(communityId, userId);
    if (!roleHasPermission(role, permission)) {
      throw new ForbiddenException(
        `You do not have the required permission: ${permission}`,
      );
    }
    return role;
  }

  /**
   * Assert user is at least a given role level.
   */
  async assertMinimumRole(
    communityId: string | Types.ObjectId,
    userId: string | Types.ObjectId,
    minimumRole: CommunityRole,
  ): Promise<CommunityRole> {
    const role = await this.getCommunityRole(communityId, userId);
    if (ROLE_HIERARCHY[role] < ROLE_HIERARCHY[minimumRole]) {
      throw new ForbiddenException(
        `Requires at least ${ROLE_LABELS[minimumRole]} role`,
      );
    }
    return role;
  }

  // ───────────────────────────────────────────────────────────────────────
  // Staff CRUD
  // ───────────────────────────────────────────────────────────────────────

  /**
   * List all staff for a community (returns owner + staff records).
   */
  async listStaff(communityId: string | Types.ObjectId) {
    const communityOid =
      communityId instanceof Types.ObjectId
        ? communityId
        : new Types.ObjectId(String(communityId));

    const [community, staffRecords] = await Promise.all([
      this.communityModel
        .findById(communityOid)
        .select('createur')
        .populate('createur', 'name email avatar photo_profil profile_picture username')
        .lean()
        .exec(),
      this.staffModel
        .find({ communityId: communityOid, status: 'active' })
        .populate('userId', 'name email avatar photo_profil profile_picture username')
        .lean()
        .exec(),
    ]);

    if (!community) return [];

    /** Map a populated user document to the shape the frontend expects */
    const mapUser = (u: any) => {
      const nameParts = (u.name ?? '').split(' ');
      return {
        _id: String(u._id),
        firstName: nameParts[0] ?? '',
        lastName: nameParts.slice(1).join(' ') ?? '',
        email: u.email ?? '',
        username: u.username ?? '',
        profileImage: u.photo_profil ?? u.profile_picture ?? u.avatar ?? null,
      };
    };

    const result: any[] = [];

    // Include owner as the first entry
    const ownerRaw = community.createur as any;
    if (ownerRaw) {
      const ownerId = String(ownerRaw._id ?? ownerRaw);
      result.push({
        _id: ownerId,
        communityId: String(communityOid),
        userId: ownerId,
        role: CommunityRole.OWNER as string,
        status: 'active',
        createdBy: ownerId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        user: mapUser(ownerRaw),
      });
    }

    // Include all active staff members
    for (const s of staffRecords) {
      const userRaw = s.userId as any;
      const uid = String(userRaw?._id ?? userRaw ?? s.userId);
      result.push({
        _id: String(s._id),
        communityId: String(communityOid),
        userId: uid,
        role: s.role,
        status: s.status,
        createdBy: String(s.createdBy),
        createdAt: (s as any).createdAt,
        updatedAt: (s as any).updatedAt,
        user: mapUser(userRaw),
      });
    }

    return result;
  }

  /**
   * Assign a staff role to a user.
   * Caller must have roles.manage.
   */
  async assignStaffRole(
    communityId: string | Types.ObjectId,
    targetUserId: string | Types.ObjectId,
    role: CommunityStaffRole,
    assignedBy: string | Types.ObjectId,
  ): Promise<CommunityStaffDocument> {
    const communityOid = new Types.ObjectId(String(communityId));
    const targetOid = new Types.ObjectId(String(targetUserId));
    const assignerOid = new Types.ObjectId(String(assignedBy));

    // Prevent assigning roles to the owner
    const community = await this.communityModel
      .findById(communityOid)
      .select('createur members')
      .lean()
      .exec();
    if (!community) {
      throw new ForbiddenException('Community not found');
    }
    if (community.createur.equals(targetOid)) {
      throw new ForbiddenException('Cannot change the owner\'s role via staff assignment');
    }

    // Prevent self-promotion: assigner's role must be higher than the role being assigned
    const assignerRole = await this.getCommunityRole(communityId, assignedBy);
    const targetNewRole = this.staffRoleToCommunityRole(role);
    if (ROLE_HIERARCHY[assignerRole] <= ROLE_HIERARCHY[targetNewRole]) {
      throw new ForbiddenException(
        'Cannot assign a role equal to or higher than your own',
      );
    }

    // Target must be a member or already staff
    const isMember = this.hasOid(community.members, targetOid);
    const existingStaff = await this.staffModel
      .findOne({ communityId: communityOid, userId: targetOid })
      .lean()
      .exec();
    if (!isMember && !existingStaff && !community.createur.equals(targetOid)) {
      throw new ForbiddenException(
        'User must be a community member before being assigned a staff role',
      );
    }

    // Upsert
    const staffRecord = await this.staffModel.findOneAndUpdate(
      { communityId: communityOid, userId: targetOid },
      {
        $set: {
          role,
          status: 'active',
          createdBy: assignerOid,
        },
        $setOnInsert: {
          communityId: communityOid,
          userId: targetOid,
        },
      },
      { upsert: true, new: true },
    );

    // Invalidate cache
    this.invalidateCache(String(communityId), String(targetUserId));

    return staffRecord;
  }

  /**
   * Update a staff member's role.
   */
  async updateStaffRole(
    communityId: string | Types.ObjectId,
    targetUserId: string | Types.ObjectId,
    newRole: CommunityStaffRole,
    updatedBy: string | Types.ObjectId,
  ): Promise<CommunityStaffDocument> {
    // Re-use assignStaffRole (upsert logic handles updating)
    return this.assignStaffRole(communityId, targetUserId, newRole, updatedBy);
  }

  /**
   * Remove a staff role from a user.
   */
  async removeStaffRole(
    communityId: string | Types.ObjectId,
    targetUserId: string | Types.ObjectId,
    removedBy: string | Types.ObjectId,
  ): Promise<void> {
    const communityOid = new Types.ObjectId(String(communityId));
    const targetOid = new Types.ObjectId(String(targetUserId));

    // Cannot remove the owner
    const community = await this.communityModel
      .findById(communityOid)
      .select('createur')
      .lean()
      .exec();
    if (!community) {
      throw new ForbiddenException('Community not found');
    }
    if (community.createur.equals(targetOid)) {
      throw new ForbiddenException('Cannot remove the owner');
    }

    // Remover's role must be higher than target's current role
    const removerRole = await this.getCommunityRole(communityId, removedBy);
    const targetRole = await this.getCommunityRole(communityId, targetUserId);
    if (ROLE_HIERARCHY[removerRole] <= ROLE_HIERARCHY[targetRole]) {
      throw new ForbiddenException(
        'Cannot remove a staff member with equal or higher role than yours',
      );
    }

    await this.staffModel.deleteOne({
      communityId: communityOid,
      userId: targetOid,
    });

    this.invalidateCache(String(communityId), String(targetUserId));
  }

  /**
   * Resolve community ID from a slug.
   */
  async resolveCommunityIdFromSlug(slug: string): Promise<string | null> {
    const doc = await this.communityModel
      .findOne({ slug })
      .select('_id')
      .lean()
      .exec();
    return doc ? String(doc._id) : null;
  }

  // ───────────────────────────────────────────────────────────────────────
  // Helpers
  // ───────────────────────────────────────────────────────────────────────

  private setCache(key: string, role: CommunityRole) {
    this.roleCache.set(key, { role, ts: Date.now() });
    // Evict old entries periodically
    if (this.roleCache.size > 10_000) {
      const now = Date.now();
      for (const [k, v] of this.roleCache) {
        if (now - v.ts > CACHE_TTL_MS) this.roleCache.delete(k);
      }
    }
  }

  invalidateCache(communityId: string, userId: string) {
    this.roleCache.delete(`${communityId}:${userId}`);
  }

  private hasOid(
    arr: Types.ObjectId[] | undefined,
    oid: Types.ObjectId,
  ): boolean {
    if (!arr || !Array.isArray(arr)) return false;
    return arr.some((a) => a && a.equals && a.equals(oid));
  }

  private staffRoleToCommunityRole(
    staffRole: CommunityStaffRole | string,
  ): CommunityRole {
    switch (staffRole) {
      case CommunityStaffRole.ADMIN:
      case 'admin':
        return CommunityRole.ADMIN;
      case CommunityStaffRole.MODERATOR:
      case 'moderator':
        return CommunityRole.MODERATOR;
      case CommunityStaffRole.SUPPORT:
      case 'support':
        return CommunityRole.SUPPORT;
      default:
        return CommunityRole.MEMBER;
    }
  }
}
