import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { AdminModule } from './admin.module';
import { AdminService } from './admin.service';
import { AuditLogService } from './common/services/audit-log.service';
import { ExportService } from './common/services/export.service';
import { AnalyticsService } from './common/services/analytics.service';
import { Admin } from '../schema/admin.schema';
import { AdminUser } from './schemas/admin-user.schema';
import { AuditLog } from './schemas/audit-log.schema';
import { ContentModerationQueue } from './schemas/content-moderation-queue.schema';
import { EmailService } from '../common/services/email.service';
import { TokenBlacklistService } from '../common/services/token-blacklist.service';

describe('AdminModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    // Mock all the models and services to avoid database connections
    const mockModel = {
      findOne: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const mockConnection = {
      db: {
        listCollections: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([]),
        }),
      },
    };

    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        JwtModule.register({
          secret: 'test-secret',
          signOptions: { expiresIn: '1h' },
        }),
      ],
      providers: [
        AdminService,
        AuditLogService,
        ExportService,
        AnalyticsService,
        {
          provide: getModelToken(Admin.name),
          useValue: mockModel,
        },
        {
          provide: getModelToken(AdminUser.name),
          useValue: mockModel,
        },
        {
          provide: getModelToken(AuditLog.name),
          useValue: mockModel,
        },
        {
          provide: getModelToken(ContentModerationQueue.name),
          useValue: mockModel,
        },
        {
          provide: getModelToken('VerificationCode'),
          useValue: mockModel,
        },
        {
          provide: 'DatabaseConnection',
          useValue: mockConnection,
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
            isTokenRevoked: jest.fn(),
            revokeTokenFromJWT: jest.fn(),
          },
        },
      ],
    }).compile();
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
  });

  it('should provide AdminService', () => {
    const adminService = module.get<AdminService>(AdminService);
    expect(adminService).toBeDefined();
  });

  it('should provide AuditLogService', () => {
    const auditLogService = module.get<AuditLogService>(AuditLogService);
    expect(auditLogService).toBeDefined();
  });

  it('should provide ExportService', () => {
    const exportService = module.get<ExportService>(ExportService);
    expect(exportService).toBeDefined();
  });

  it('should provide AnalyticsService', () => {
    const analyticsService = module.get<AnalyticsService>(AnalyticsService);
    expect(analyticsService).toBeDefined();
  });
});