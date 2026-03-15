/**
 * Community Invitation Service — Comprehensive Jest Test Suite
 *
 * Covers every public method with multiple scenarios per case:
 *   inviteSingle, importContacts, validateToken, acceptInvitation,
 *   resendInvitation, revokeInvitation, deleteInvitation,
 *   getInvitations, getStats, expireOldInvitations
 */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

import { CommunityInvitationService } from '../community-invitation.service';
import {
  CommunityInvitation,
  InvitationStatus,
} from '../../schema/community-invitation.schema';
import { Community } from '../../schema/community.schema';
import { User } from '../../schema/user.schema';
import { EmailService } from '../../common/services/email.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const id = () => new Types.ObjectId().toString();

const mkCommunity = (overrides: Record<string, any> = {}) => ({
  _id: new Types.ObjectId(),
  name: 'Test Community',
  nom: 'Test Community',
  slug: 'test-community',
  createur: new Types.ObjectId(),
  members: [] as Types.ObjectId[],
  membersCount: 0,
  save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

const mkUser = (overrides: Record<string, any> = {}) => ({
  _id: new Types.ObjectId(),
  name: 'Test User',
  email: 'test@example.com',
  joinedCommunities: [],
  save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

const mkInvitation = (overrides: Record<string, any> = {}) => ({
  _id: new Types.ObjectId(),
  email: 'invited@example.com',
  name: 'Invited Person',
  communityId: new Types.ObjectId(),
  creatorId: new Types.ObjectId(),
  token: 'test-token-uuid',
  status: InvitationStatus.PENDING,
  personalMessage: '',
  invitedAt: new Date(),
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  resendCount: 0,
  lastResentAt: undefined as Date | undefined,
  acceptedByUserId: undefined as Types.ObjectId | undefined,
  acceptedAt: undefined as Date | undefined,
  save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

const mockInvitationModel = () => ({
  findOne: jest.fn(),
  findById: jest.fn(),
  find: jest.fn(),
  findOneAndUpdate: jest.fn(),
  create: jest.fn(),
  countDocuments: jest.fn(),
  updateMany: jest.fn(),
  deleteOne: jest.fn(),
});

const mockCommunityModel = () => ({
  findById: jest.fn(),
});

const mockUserModel = () => ({
  findById: jest.fn(),
  findOne: jest.fn(),
  updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
});

const mockEmailService = () => ({
  sendCommunityInvitationEmail: jest.fn().mockResolvedValue(undefined),
});

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

describe('CommunityInvitationService', () => {
  let service: CommunityInvitationService;
  let invitationModel: ReturnType<typeof mockInvitationModel>;
  let communityModel: ReturnType<typeof mockCommunityModel>;
  let userModel: ReturnType<typeof mockUserModel>;
  let emailService: ReturnType<typeof mockEmailService>;

  let creatorId: string;
  let communityObjectId: Types.ObjectId;
  let communityIdStr: string;
  let community: ReturnType<typeof mkCommunity>;
  let creator: ReturnType<typeof mkUser>;

  beforeEach(async () => {
    invitationModel = mockInvitationModel();
    communityModel = mockCommunityModel();
    userModel = mockUserModel();
    emailService = mockEmailService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunityInvitationService,
        { provide: getModelToken(CommunityInvitation.name), useValue: invitationModel },
        { provide: getModelToken(Community.name), useValue: communityModel },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    service = module.get<CommunityInvitationService>(CommunityInvitationService);

    // Fresh IDs for each test
    communityObjectId = new Types.ObjectId();
    communityIdStr = communityObjectId.toString();
    creator = mkUser({ _id: new Types.ObjectId() });
    creatorId = creator._id.toString();

    community = mkCommunity({
      _id: communityObjectId,
      createur: creator._id,
    });

    communityModel.findById.mockResolvedValue(community);
    userModel.findById.mockResolvedValue(creator);
  });

  // =========================================================================
  // inviteSingle
  // =========================================================================

  describe('inviteSingle()', () => {
    const dto = () => ({
      email: 'new@example.com',
      name: 'Alice',
      communityId: communityIdStr,
      personalMessage: 'Please join us!',
    });

    it('creates a new invitation and sends email when no prior invite exists', async () => {
      invitationModel.findOne.mockResolvedValue(null); // no accepted invite
      invitationModel.findOne.mockResolvedValueOnce(null); // no accepted
      invitationModel.findOne.mockResolvedValueOnce(null); // no user match in isAlreadyMember
      userModel.findOne.mockResolvedValue(null); // not a user yet

      const freshInvite = mkInvitation({ email: 'new@example.com' });
      invitationModel.create.mockResolvedValue(freshInvite);

      const result = await service.inviteSingle(creatorId, dto());

      expect(invitationModel.create).toHaveBeenCalledTimes(1);
      expect(emailService.sendCommunityInvitationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'new@example.com' }),
      );
      expect(result).toMatchObject({ email: 'new@example.com' });
    });

    it('upserts an existing PENDING invitation (refreshes token + expiry, resends email)', async () => {
      const existingPending = mkInvitation({
        email: 'new@example.com',
        status: InvitationStatus.PENDING,
        resendCount: 0,
      });
      // invitationModel.findOne calls:
      //   1. accepted check → null
      //   2. upsert check (pending/expired/revoked) → existingPending
      invitationModel.findOne
        .mockResolvedValueOnce(null)           // no accepted invite
        .mockResolvedValueOnce(existingPending); // existing pending

      // isAlreadyMember → userModel.findOne (not in community)
      userModel.findOne.mockResolvedValue(null);

      const result = await service.inviteSingle(creatorId, dto());

      expect(invitationModel.create).not.toHaveBeenCalled();
      expect(existingPending.save).toHaveBeenCalled();
      expect(existingPending.resendCount).toBe(1);
      expect(existingPending.status).toBe(InvitationStatus.PENDING);
      expect(emailService.sendCommunityInvitationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'new@example.com' }),
      );
      expect(result).toBe(existingPending);
    });

    it('upserts an EXPIRED invitation (reactivates it)', async () => {
      const expiredInvite = mkInvitation({
        email: 'new@example.com',
        status: InvitationStatus.EXPIRED,
        resendCount: 1,
      });
      // invitationModel.findOne calls:
      //   1. accepted check → null
      //   2. upsert check → expiredInvite
      invitationModel.findOne
        .mockResolvedValueOnce(null)           // no accepted
        .mockResolvedValueOnce(expiredInvite); // existing expired

      userModel.findOne.mockResolvedValue(null); // isAlreadyMember

      await service.inviteSingle(creatorId, dto());

      expect(expiredInvite.status).toBe(InvitationStatus.PENDING);
      expect(expiredInvite.save).toHaveBeenCalled();
      expect(invitationModel.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException if email already accepted (joined community)', async () => {
      const acceptedInvite = mkInvitation({ status: InvitationStatus.ACCEPTED });
      invitationModel.findOne.mockResolvedValueOnce(acceptedInvite);

      await expect(service.inviteSingle(creatorId, dto())).rejects.toThrow(
        ConflictException,
      );
      expect(invitationModel.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException if user is already a community member', async () => {
      const memberUser = mkUser({ email: 'new@example.com', _id: new Types.ObjectId() });
      community.members = [memberUser._id];

      invitationModel.findOne
        .mockResolvedValueOnce(null)  // no accepted invite
        .mockResolvedValueOnce(null); // isAlreadyMember lead finder
      userModel.findOne.mockResolvedValue(memberUser);

      await expect(service.inviteSingle(creatorId, dto())).rejects.toThrow(
        ConflictException,
      );
      expect(invitationModel.create).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException if caller is not community creator', async () => {
      const strangerCommunity = mkCommunity({ createur: new Types.ObjectId() }); // different owner
      communityModel.findById.mockResolvedValue(strangerCommunity);

      await expect(service.inviteSingle(creatorId, dto())).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFoundException if community does not exist', async () => {
      communityModel.findById.mockResolvedValue(null);

      await expect(service.inviteSingle(creatorId, dto())).rejects.toThrow(
        NotFoundException,
      );
    });

    it('saves invitation even when email sending fails', async () => {
      emailService.sendCommunityInvitationEmail.mockRejectedValue(
        new Error('SMTP failure'),
      );
      invitationModel.findOne.mockResolvedValue(null);
      userModel.findOne.mockResolvedValue(null);
      const freshInvite = mkInvitation({ email: 'new@example.com' });
      invitationModel.create.mockResolvedValue(freshInvite);

      // Should NOT throw — email failure is fire-and-forget
      await expect(service.inviteSingle(creatorId, dto())).resolves.toBeDefined();
      expect(invitationModel.create).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // importContacts
  // =========================================================================

  describe('importContacts()', () => {
    it('creates invitations for all new contacts', async () => {
      invitationModel.findOne.mockResolvedValue(null);
      userModel.findOne.mockResolvedValue(null);
      invitationModel.create.mockResolvedValue(mkInvitation());

      const result = await service.importContacts(creatorId, {
        communityId: communityIdStr,
        contacts: [
          { email: 'a@test.com', name: 'A' },
          { email: 'b@test.com', name: 'B' },
        ],
      });

      expect(result.created).toBe(2);
      expect(result.skipped).toBe(0);
      expect(result.skippedEmails).toHaveLength(0);
      expect(invitationModel.create).toHaveBeenCalledTimes(2);
    });

    it('skips contacts that already have a PENDING or ACCEPTED invitation', async () => {
      // First contact: existing pending, second: new
      invitationModel.findOne
        .mockResolvedValueOnce(mkInvitation({ status: InvitationStatus.PENDING }))
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null); // isAlreadyMember call
      userModel.findOne.mockResolvedValue(null);
      invitationModel.create.mockResolvedValue(mkInvitation());

      const result = await service.importContacts(creatorId, {
        communityId: communityIdStr,
        contacts: [
          { email: 'existing@test.com' },
          { email: 'new@test.com' },
        ],
      });

      expect(result.created).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.skippedEmails).toContain('existing@test.com');
    });

    it('skips contacts who are already community members', async () => {
      const memberUser = mkUser({ email: 'member@test.com', _id: new Types.ObjectId() });
      community.members = [memberUser._id];

      invitationModel.findOne.mockResolvedValue(null);
      userModel.findOne.mockResolvedValueOnce(memberUser); // member lookup
      invitationModel.create.mockResolvedValue(mkInvitation());

      const result = await service.importContacts(creatorId, {
        communityId: communityIdStr,
        contacts: [{ email: 'member@test.com' }],
      });

      expect(result.skipped).toBe(1);
      expect(invitationModel.create).not.toHaveBeenCalled();
    });

    it('handles empty contacts list gracefully', async () => {
      const result = await service.importContacts(creatorId, {
        communityId: communityIdStr,
        contacts: [],
      });
      expect(result.created).toBe(0);
      expect(result.skipped).toBe(0);
    });

    it('throws ForbiddenException for non-owner callers', async () => {
      communityModel.findById.mockResolvedValue(
        mkCommunity({ createur: new Types.ObjectId() }),
      );

      await expect(
        service.importContacts(creatorId, {
          communityId: communityIdStr,
          contacts: [{ email: 'x@test.com' }],
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // validateToken
  // =========================================================================

  describe('validateToken()', () => {
    it('returns valid=true for a valid PENDING token', async () => {
      const invite = mkInvitation({ status: InvitationStatus.PENDING });
      invitationModel.findOne.mockResolvedValue(invite);
      communityModel.findById.mockResolvedValue(community);
      userModel.findById.mockResolvedValue(creator);

      const result = await service.validateToken('some-token');

      expect(result.valid).toBe(true);
      expect(result.isExpired).toBe(false);
      expect(result.isAccepted).toBe(false);
      expect(result.isRevoked).toBe(false);
      expect(result.communityName).toBe(community.name);
    });

    it('returns valid=false and isAccepted=true for an accepted invitation', async () => {
      const invite = mkInvitation({ status: InvitationStatus.ACCEPTED });
      invitationModel.findOne.mockResolvedValue(invite);
      communityModel.findById.mockResolvedValue(community);
      userModel.findById.mockResolvedValue(creator);

      const result = await service.validateToken('some-token');

      expect(result.valid).toBe(false);
      expect(result.isAccepted).toBe(true);
    });

    it('returns valid=false and isRevoked=true for a revoked invitation', async () => {
      const invite = mkInvitation({ status: InvitationStatus.REVOKED });
      invitationModel.findOne.mockResolvedValue(invite);
      communityModel.findById.mockResolvedValue(community);
      userModel.findById.mockResolvedValue(creator);

      const result = await service.validateToken('some-token');

      expect(result.valid).toBe(false);
      expect(result.isRevoked).toBe(true);
    });

    it('auto-expires a PENDING invitation whose expiresAt is in the past', async () => {
      const expired = mkInvitation({
        status: InvitationStatus.PENDING,
        expiresAt: new Date(Date.now() - 1000), // already expired
      });
      invitationModel.findOne.mockResolvedValue(expired);
      communityModel.findById.mockResolvedValue(community);
      userModel.findById.mockResolvedValue(creator);

      const result = await service.validateToken('some-token');

      expect(expired.status).toBe(InvitationStatus.EXPIRED);
      expect(expired.save).toHaveBeenCalled();
      expect(result.isExpired).toBe(true);
      expect(result.valid).toBe(false);
    });

    it('throws NotFoundException for unknown token', async () => {
      invitationModel.findOne.mockResolvedValue(null);

      await expect(service.validateToken('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // acceptInvitation
  // =========================================================================

  describe('acceptInvitation()', () => {
    let userId: string;
    let inviterUser: ReturnType<typeof mkUser>;
    let invite: ReturnType<typeof mkInvitation>;

    beforeEach(() => {
      inviterUser = mkUser({ _id: new Types.ObjectId() });
      userId = inviterUser._id.toString();
      invite = mkInvitation({
        communityId: communityObjectId,
        status: InvitationStatus.PENDING,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      invitationModel.findOne.mockResolvedValue(invite);
      communityModel.findById.mockResolvedValue(community);
      userModel.findById.mockResolvedValue(inviterUser);
    });

    it('adds user to community members and marks invitation ACCEPTED', async () => {
      const result = await service.acceptInvitation(invite.token, userId);

      expect(result.success).toBe(true);
      expect(result.communityId).toBe(communityObjectId.toString());
      expect(invite.status).toBe(InvitationStatus.ACCEPTED);
      expect(invite.acceptedByUserId).toBeDefined();
      expect(invite.save).toHaveBeenCalled();
      expect(community.save).toHaveBeenCalled();
      expect(userModel.updateOne).toHaveBeenCalledWith(
        { _id: userId },
        { $addToSet: { joinedCommunities: community._id } },
      );
    });

    it('is idempotent — returns success if invitation already ACCEPTED', async () => {
      const alreadyAccepted = mkInvitation({ status: InvitationStatus.ACCEPTED });
      invitationModel.findOne.mockResolvedValue(alreadyAccepted);

      const result = await service.acceptInvitation(alreadyAccepted.token, userId);

      expect(result.success).toBe(true);
      // Should not try to modify community because accepted branch returns early
      expect(alreadyAccepted.save).not.toHaveBeenCalled();
    });

    it('does not double-add user if already a community member', async () => {
      community.members = [new Types.ObjectId(userId)]; // already in list
      const pushSpy = jest.spyOn(community.members, 'push');

      await service.acceptInvitation(invite.token, userId);

      expect(pushSpy).not.toHaveBeenCalled();
      expect(community.save).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for a REVOKED invitation', async () => {
      invitationModel.findOne.mockResolvedValue(
        mkInvitation({ status: InvitationStatus.REVOKED }),
      );

      await expect(service.acceptInvitation('revoked-token', userId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException for an EXPIRED invitation', async () => {
      invitationModel.findOne.mockResolvedValue(
        mkInvitation({
          status: InvitationStatus.EXPIRED,
          expiresAt: new Date(Date.now() - 1000),
        }),
      );

      await expect(service.acceptInvitation('expired-token', userId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when invitation is still PENDING but expiresAt is in the past', async () => {
      invitationModel.findOne.mockResolvedValue(
        mkInvitation({
          status: InvitationStatus.PENDING,
          expiresAt: new Date(Date.now() - 1000),
        }),
      );

      await expect(service.acceptInvitation('past-pending-token', userId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException for unknown token', async () => {
      invitationModel.findOne.mockResolvedValue(null);

      await expect(service.acceptInvitation('unknown', userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException if community was deleted', async () => {
      communityModel.findById.mockResolvedValue(null);

      await expect(service.acceptInvitation(invite.token, userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException if user account no longer exists', async () => {
      userModel.findById.mockResolvedValue(null);

      await expect(service.acceptInvitation(invite.token, userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // resendInvitation
  // =========================================================================

  describe('resendInvitation()', () => {
    let invite: ReturnType<typeof mkInvitation>;

    beforeEach(() => {
      invite = mkInvitation({
        communityId: communityObjectId,
        status: InvitationStatus.PENDING,
        lastResentAt: undefined,
        resendCount: 0,
      });
      invitationModel.findById.mockResolvedValue(invite);
    });

    it('resends email and increments resendCount', async () => {
      const result = await service.resendInvitation(creatorId, invite._id.toString());

      expect(result.resendCount).toBe(1);
      expect(invite.save).toHaveBeenCalled();
      expect(emailService.sendCommunityInvitationEmail).toHaveBeenCalledTimes(1);
    });

    it('refreshes expiresAt when resending', async () => {
      const before = new Date();
      await service.resendInvitation(creatorId, invite._id.toString());
      expect(invite.expiresAt.getTime()).toBeGreaterThan(before.getTime());
    });

    it('throws BadRequestException within 24h cooldown window', async () => {
      (invite as any).lastResentAt = new Date(Date.now() - 60 * 60 * 1000); // 1h ago
      invitationModel.findById.mockResolvedValue(invite);

      await expect(
        service.resendInvitation(creatorId, invite._id.toString()),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows resend after cooldown has passed', async () => {
      (invite as any).lastResentAt = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25h ago
      invitationModel.findById.mockResolvedValue(invite);

      await expect(
        service.resendInvitation(creatorId, invite._id.toString()),
      ).resolves.toBeDefined();
    });

    it('throws BadRequestException for an already ACCEPTED invitation', async () => {
      invitationModel.findById.mockResolvedValue(
        mkInvitation({ communityId: communityObjectId, status: InvitationStatus.ACCEPTED }),
      );

      await expect(
        service.resendInvitation(creatorId, invite._id.toString()),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for a REVOKED invitation', async () => {
      invitationModel.findById.mockResolvedValue(
        mkInvitation({ communityId: communityObjectId, status: InvitationStatus.REVOKED }),
      );

      await expect(
        service.resendInvitation(creatorId, invite._id.toString()),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for unknown invitationId', async () => {
      invitationModel.findById.mockResolvedValue(null);

      await expect(
        service.resendInvitation(creatorId, id()),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for non-owner callers', async () => {
      communityModel.findById.mockResolvedValue(
        mkCommunity({ _id: communityObjectId, createur: new Types.ObjectId() }),
      );

      await expect(
        service.resendInvitation(id(), invite._id.toString()),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // revokeInvitation
  // =========================================================================

  describe('revokeInvitation()', () => {
    let invite: ReturnType<typeof mkInvitation>;

    beforeEach(() => {
      invite = mkInvitation({ communityId: communityObjectId, status: InvitationStatus.PENDING });
      invitationModel.findById.mockResolvedValue(invite);
    });

    it('sets status to REVOKED and saves', async () => {
      const result = await service.revokeInvitation(creatorId, invite._id.toString());

      expect(result.status).toBe(InvitationStatus.REVOKED);
      expect(invite.save).toHaveBeenCalled();
    });

    it('throws BadRequestException when trying to revoke an ACCEPTED invitation', async () => {
      invitationModel.findById.mockResolvedValue(
        mkInvitation({ communityId: communityObjectId, status: InvitationStatus.ACCEPTED }),
      );

      await expect(
        service.revokeInvitation(creatorId, invite._id.toString()),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for unknown invitationId', async () => {
      invitationModel.findById.mockResolvedValue(null);

      await expect(service.revokeInvitation(creatorId, id())).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException for non-owner callers', async () => {
      communityModel.findById.mockResolvedValue(
        mkCommunity({ _id: communityObjectId, createur: new Types.ObjectId() }),
      );

      await expect(
        service.revokeInvitation(id(), invite._id.toString()),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // deleteInvitation
  // =========================================================================

  describe('deleteInvitation()', () => {
    it('deletes an invitation and returns void', async () => {
      const invite = mkInvitation({ communityId: communityObjectId });
      invitationModel.findById.mockResolvedValue(invite);
      invitationModel.deleteOne.mockResolvedValue({ deletedCount: 1 });

      await expect(
        service.deleteInvitation(creatorId, invite._id.toString()),
      ).resolves.toBeUndefined();

      expect(invitationModel.deleteOne).toHaveBeenCalledWith({ _id: invite._id });
    });

    it('throws NotFoundException for unknown invitationId', async () => {
      invitationModel.findById.mockResolvedValue(null);

      await expect(service.deleteInvitation(creatorId, id())).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException for non-owner callers', async () => {
      const invite = mkInvitation({ communityId: communityObjectId });
      invitationModel.findById.mockResolvedValue(invite);
      communityModel.findById.mockResolvedValue(
        mkCommunity({ _id: communityObjectId, createur: new Types.ObjectId() }),
      );

      await expect(service.deleteInvitation(id(), invite._id.toString())).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // =========================================================================
  // getInvitations
  // =========================================================================

  describe('getInvitations()', () => {
    const query = { page: 1, limit: 20 };

    it('returns paginated invitations for the community owner', async () => {
      const items = [mkInvitation(), mkInvitation()];
      invitationModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(items),
      });
      invitationModel.countDocuments.mockResolvedValue(2);

      const result = await service.getInvitations(creatorId, communityIdStr, query);

      expect(result.invitations).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.totalPages).toBe(1);
    });

    it('applies status filter when provided', async () => {
      invitationModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });
      invitationModel.countDocuments.mockResolvedValue(0);

      await service.getInvitations(creatorId, communityIdStr, {
        ...query,
        status: InvitationStatus.ACCEPTED as any,
      });

      expect(invitationModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ status: InvitationStatus.ACCEPTED }),
      );
    });

    it('throws ForbiddenException for non-owner callers', async () => {
      communityModel.findById.mockResolvedValue(
        mkCommunity({ createur: new Types.ObjectId() }),
      );

      await expect(
        service.getInvitations(id(), communityIdStr, query),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // getStats
  // =========================================================================

  describe('getStats()', () => {
    it('calculates correct stats and conversion rate', async () => {
      invitationModel.countDocuments
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(6)  // pending
        .mockResolvedValueOnce(3)  // accepted
        .mockResolvedValueOnce(1)  // expired
        .mockResolvedValueOnce(0); // revoked

      const stats = await service.getStats(creatorId, communityIdStr);

      expect(stats.total).toBe(10);
      expect(stats.pending).toBe(6);
      expect(stats.accepted).toBe(3);
      expect(stats.expired).toBe(1);
      expect(stats.revoked).toBe(0);
      expect(stats.conversionRate).toBe(30); // 3/10 * 100
    });

    it('returns conversionRate=0 when total is 0', async () => {
      invitationModel.countDocuments.mockResolvedValue(0);

      const stats = await service.getStats(creatorId, communityIdStr);

      expect(stats.conversionRate).toBe(0);
    });

    it('throws ForbiddenException for non-owner callers', async () => {
      communityModel.findById.mockResolvedValue(
        mkCommunity({ createur: new Types.ObjectId() }),
      );

      await expect(service.getStats(id(), communityIdStr)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // =========================================================================
  // expireOldInvitations (CRON)
  // =========================================================================

  describe('expireOldInvitations()', () => {
    it('marks expired pending invitations as EXPIRED', async () => {
      invitationModel.updateMany.mockResolvedValue({ modifiedCount: 5 });

      await service.expireOldInvitations();

      expect(invitationModel.updateMany).toHaveBeenCalledWith(
        {
          status: InvitationStatus.PENDING,
          expiresAt: { $lt: expect.any(Date) },
        },
        { $set: { status: InvitationStatus.EXPIRED } },
      );
    });

    it('handles zero expired invitations without error', async () => {
      invitationModel.updateMany.mockResolvedValue({ modifiedCount: 0 });

      await expect(service.expireOldInvitations()).resolves.toBeUndefined();
    });
  });
});
