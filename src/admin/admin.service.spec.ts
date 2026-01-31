import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AdminService } from './admin.service';
import { Admin } from '../schema/admin.schema';
import { AdminUser, AdminRole, AdminPermission } from './schemas/admin-user.schema';
import { EmailService } from '../common/services/email.service';
import { TokenBlacklistService } from '../common/services/token-blacklist.service';
import { Types } from 'mongoose';

describe('AdminService', () => {
  let service: AdminService;
  let mockAdminModel: any;
  let mockAdminUserModel: any;
  let mockVerificationCodeModel: any;
  let mockConnection: any;

  beforeEach(async () => {
    // Mock models
    mockAdminModel = {
      findOne: jest.fn(),
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      countDocuments: jest.fn(),
      create: jest.fn(),
    };

    mockAdminUserModel = {
      findOne: jest.fn(),
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findOneAndUpdate: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    mockVerificationCodeModel = {
      findOne: jest.fn(),
      deleteMany: jest.fn(),
      deleteOne: jest.fn(),
      create: jest.fn(),
    };

    mockConnection = {
      db: {
        listCollections: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([]),
        }),
        collection: jest.fn().mockReturnValue({
          deleteMany: jest.fn(),
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: getModelToken(Admin.name),
          useValue: mockAdminModel,
        },
        {
          provide: getModelToken(AdminUser.name),
          useValue: mockAdminUserModel,
        },
        {
          provide: getModelToken('VerificationCode'),
          useValue: mockVerificationCodeModel,
        },
        {
          provide: 'DatabaseConnection',
          useValue: mockConnection,
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock-token'),
            verify: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('mock-config'),
          },
        },
        {
          provide: EmailService,
          useValue: {
            send2FACode: jest.fn(),
            sendPasswordResetEmail: jest.fn(),
          },
        },
        {
          provide: TokenBlacklistService,
          useValue: {
            isTokenRevoked: jest.fn().mockResolvedValue(false),
            revokeTokenFromJWT: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isAdminUser', () => {
    it('should return true for valid admin user', async () => {
      const userId = new Types.ObjectId().toString();
      mockAdminUserModel.findOne.mockResolvedValue({
        _id: new Types.ObjectId(),
        userId: new Types.ObjectId(userId),
        roles: [AdminRole.SUPER_ADMIN],
        isActive: true,
      });

      const result = await service.isAdminUser(userId);
      expect(result).toBe(true);
      expect(mockAdminUserModel.findOne).toHaveBeenCalledWith({
        userId: new Types.ObjectId(userId),
        isActive: true,
      });
    });

    it('should return false for non-admin user', async () => {
      const userId = new Types.ObjectId().toString();
      mockAdminUserModel.findOne.mockResolvedValue(null);

      const result = await service.isAdminUser(userId);
      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      const userId = 'invalid-id';
      mockAdminUserModel.findOne.mockRejectedValue(new Error('Invalid ObjectId'));

      const result = await service.isAdminUser(userId);
      expect(result).toBe(false);
    });
  });

  describe('getAdminUser', () => {
    it('should return admin user info for valid user', async () => {
      const userId = new Types.ObjectId().toString();
      const mockAdminUser = {
        _id: new Types.ObjectId(),
        userId: new Types.ObjectId(userId),
        roles: [AdminRole.USER_MANAGER],
        permissions: [AdminPermission.VIEW_USERS],
        isActive: true,
        lastLoginAt: new Date(),
        lastActivityAt: new Date(),
      };

      mockAdminUserModel.findOne.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockAdminUser),
        }),
      });

      const result = await service.getAdminUser(userId);
      expect(result).toBeDefined();
      expect(result?._id).toEqual(mockAdminUser._id);
      expect(result?.roles).toEqual(mockAdminUser.roles);
      expect(result?.permissions).toEqual(mockAdminUser.permissions);
    });

    it('should return null for non-existent user', async () => {
      const userId = new Types.ObjectId().toString();
      mockAdminUserModel.findOne.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      });

      const result = await service.getAdminUser(userId);
      expect(result).toBeNull();
    });
  });

  describe('hasAdminRole', () => {
    it('should return true for user with required role', async () => {
      const userId = new Types.ObjectId().toString();
      mockAdminUserModel.findOne.mockResolvedValue({
        _id: new Types.ObjectId(),
        userId: new Types.ObjectId(userId),
        roles: [AdminRole.CONTENT_MODERATOR],
        isActive: true,
      });

      const result = await service.hasAdminRole(userId, AdminRole.CONTENT_MODERATOR);
      expect(result).toBe(true);
    });

    it('should return false for user without required role', async () => {
      const userId = new Types.ObjectId().toString();
      mockAdminUserModel.findOne.mockResolvedValue(null);

      const result = await service.hasAdminRole(userId, AdminRole.SUPER_ADMIN);
      expect(result).toBe(false);
    });
  });

  describe('hasAdminPermission', () => {
    it('should return true for user with required permission', async () => {
      const userId = new Types.ObjectId().toString();
      mockAdminUserModel.findOne.mockResolvedValue({
        _id: new Types.ObjectId(),
        userId: new Types.ObjectId(userId),
        permissions: [AdminPermission.VIEW_USERS],
        isActive: true,
      });

      const result = await service.hasAdminPermission(userId, AdminPermission.VIEW_USERS);
      expect(result).toBe(true);
    });

    it('should return false for user without required permission', async () => {
      const userId = new Types.ObjectId().toString();
      mockAdminUserModel.findOne.mockResolvedValue(null);

      const result = await service.hasAdminPermission(userId, AdminPermission.MANAGE_ADMIN_USERS);
      expect(result).toBe(false);
    });
  });

  describe('updateLastActivity', () => {
    it('should update last activity timestamp', async () => {
      const adminUserId = new Types.ObjectId().toString();
      mockAdminUserModel.findByIdAndUpdate.mockResolvedValue({});

      await service.updateLastActivity(adminUserId);
      expect(mockAdminUserModel.findByIdAndUpdate).toHaveBeenCalledWith(
        adminUserId,
        { lastActivityAt: expect.any(Date) }
      );
    });

    it('should not throw error on failure', async () => {
      const adminUserId = new Types.ObjectId().toString();
      mockAdminUserModel.findByIdAndUpdate.mockRejectedValue(new Error('Database error'));

      await expect(service.updateLastActivity(adminUserId)).resolves.not.toThrow();
    });
  });
});