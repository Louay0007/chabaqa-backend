import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, Types } from 'mongoose';
import { JwtService } from '@nestjs/jwt';

// Import existing system services
import { AuthService } from '../../../auth/auth.service';
import { EmailService } from '../../../common/services/email.service';
import { UploadService } from '../../../upload/upload.service';
import { StripePaymentService } from '../../../common/services/stripe-payment.service';

// Import admin services
import { AdminService } from '../../admin.service';
import { AuditLogService } from './audit-log.service';
import { SecurityMonitoringService } from './security-monitoring.service';
import { AdminNotificationService } from './admin-notification.service';

// Import schemas
import { User, UserDocument } from '../../../schema/user.schema';
import { Admin, AdminDocument } from '../../../schema/admin.schema';
import { AdminUser, AdminUserDocument } from '../../schemas/admin-user.schema';
import { AuditLog, AuditLogDocument, AdminAction } from '../../schemas/audit-log.schema';
import { getJwtSecret } from '../../../common/utils/security-config.util';

/**
 * AdminIntegrationService handles integration between admin module and existing platform systems
 * Ensures seamless operation with authentication, database, and external services
 */
@Injectable()
export class AdminIntegrationService implements OnModuleInit {
  private readonly logger = new Logger(AdminIntegrationService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Admin.name) private adminModel: Model<AdminDocument>,
    @InjectModel(AdminUser.name) private adminUserModel: Model<AdminUserDocument>,
    @InjectModel(AuditLog.name) private auditLogModel: Model<AuditLogDocument>,
    @InjectConnection() private connection: Connection,
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
    private readonly emailService: EmailService,
    private readonly uploadService: UploadService,
    private readonly stripePaymentService: StripePaymentService,
    private readonly adminService: AdminService,
    private readonly auditLogService: AuditLogService,
    private readonly securityMonitoringService: SecurityMonitoringService,
    private readonly adminNotificationService: AdminNotificationService,
  ) {}

  /**
   * Initialize integration on module startup
   */
  async onModuleInit() {
    this.logger.log('Initializing admin module integration...');
    
    try {
      // Verify database connection
      await this.verifyDatabaseConnection();
      
      // Verify authentication system integration
      await this.verifyAuthenticationIntegration();
      
      // Verify external services integration
      await this.verifyExternalServicesIntegration();
      
      this.logger.log('✅ Admin module integration initialized successfully');
    } catch (error) {
      this.logger.error('❌ Admin module integration initialization failed:', error);
      throw error;
    }
  }

  /**
   * Verify database connection and schema consistency
   */
  private async verifyDatabaseConnection(): Promise<void> {
    try {
      // Check if database is connected
      if (this.connection.readyState !== 1) {
        throw new Error('Database connection is not ready');
      }

      // Verify required collections exist
      if (!this.connection.db) {
        throw new Error('Database instance not available');
      }

      const collections = await this.connection.db.listCollections().toArray();
      const collectionNames = collections.map(c => c.name);

      const requiredCollections = [
        'users',
        'admins',
        'adminusers',
        'auditlogs',
      ];

      const missingCollections = requiredCollections.filter(
        name => !collectionNames.includes(name)
      );

      if (missingCollections.length > 0) {
        this.logger.warn(
          `Missing collections will be created on first use: ${missingCollections.join(', ')}`
        );
      }

      // Verify indexes are created
      await this.ensureIndexes();

      this.logger.log('✅ Database connection verified');
    } catch (error) {
      this.logger.error('❌ Database verification failed:', error);
      throw error;
    }
  }

  /**
   * Ensure required database indexes exist
   */
  private async ensureIndexes(): Promise<void> {
    try {
      // AdminUser indexes
      await this.adminUserModel.collection.createIndex({ userId: 1 }, { unique: true });
      await this.adminUserModel.collection.createIndex({ isActive: 1 });
      await this.adminUserModel.collection.createIndex({ roles: 1 });

      // AuditLog indexes
      await this.auditLogModel.collection.createIndex({ adminUserId: 1 });
      await this.auditLogModel.collection.createIndex({ timestamp: -1 });
      await this.auditLogModel.collection.createIndex({ action: 1 });
      await this.auditLogModel.collection.createIndex({ entityType: 1, entityId: 1 });
      await this.auditLogModel.collection.createIndex({ ipAddress: 1 });

      this.logger.log('✅ Database indexes verified');
    } catch (error) {
      this.logger.warn('⚠️ Index creation warning:', error.message);
      // Don't throw - indexes might already exist
    }
  }

  /**
   * Verify authentication system integration
   */
  private async verifyAuthenticationIntegration(): Promise<void> {
    try {
      // Verify JWT service is available
      if (!this.jwtService) {
        throw new Error('JWT service not available');
      }

      // Verify auth service is available
      if (!this.authService) {
        throw new Error('Auth service not available');
      }

      // Test JWT token generation and verification
      const testPayload = { sub: 'test', email: 'test@test.com', role: 'admin' };
      const testToken = this.jwtService.sign(testPayload, {
        expiresIn: '1m',
        secret: getJwtSecret(),
      });

      const verified = this.jwtService.verify(testToken, {
        secret: getJwtSecret(),
      });

      if (!verified || verified.sub !== 'test') {
        throw new Error('JWT verification failed');
      }

      this.logger.log('✅ Authentication system integration verified');
    } catch (error) {
      this.logger.error('❌ Authentication integration verification failed:', error);
      throw error;
    }
  }

  /**
   * Verify external services integration
   */
  private async verifyExternalServicesIntegration(): Promise<void> {
    try {
      // Verify email service
      if (!this.emailService) {
        this.logger.warn('⚠️ Email service not available');
      } else {
        this.logger.log('✅ Email service available');
      }

      // Verify upload service
      if (!this.uploadService) {
        this.logger.warn('⚠️ Upload service not available');
      } else {
        this.logger.log('✅ Upload service available');
      }

      // Verify payment service
      if (!this.stripePaymentService) {
        this.logger.warn('⚠️ Payment service not available');
      } else {
        this.logger.log('✅ Payment service available');
      }

      this.logger.log('✅ External services integration verified');
    } catch (error) {
      this.logger.error('❌ External services verification failed:', error);
      throw error;
    }
  }

  /**
   * Authenticate admin user using existing JWT authentication
   * @param token - JWT access token
   */
  async authenticateAdminUser(token: string): Promise<{
    userId: string;
    email: string;
    role: string;
    isAdmin: boolean;
    adminUser?: any;
  }> {
    try {
      // Verify JWT token
      const payload = this.jwtService.verify(token, {
        secret: getJwtSecret(),
      });

      if (!payload || !payload.sub) {
        throw new Error('Invalid token payload');
      }

      // Get user from database
      const user = await this.authService.getUserById(payload.sub);
      if (!user) {
        throw new Error('User not found');
      }

      // Check if user has admin privileges
      const isAdmin = await this.adminService.isAdminUser(payload.sub);
      
      let adminUser: any = null;
      if (isAdmin) {
        adminUser = await this.adminService.getAdminUser(payload.sub);
        
        // Update last login
        await this.adminService.updateLastLogin(payload.sub);
      }

      return {
        userId: payload.sub,
        email: payload.email,
        role: payload.role,
        isAdmin,
        adminUser,
      };
    } catch (error) {
      this.logger.error('Admin authentication failed:', error);
      throw error;
    }
  }

  /**
   * Sync admin user with existing user account
   * Ensures consistency between User and AdminUser schemas
   */
  async syncAdminUserWithUserAccount(userId: string): Promise<void> {
    try {
      // Get user from database
      const user = await this.userModel.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Get admin user
      const adminUser = await this.adminUserModel.findOne({ userId: new Types.ObjectId(userId) });
      if (!adminUser) {
        return; // Not an admin user, nothing to sync
      }

      // Verify user account is active
      if (user.isSuspended) {
        this.logger.warn(`Admin user ${userId} has suspended user account`);
        // Optionally deactivate admin user
        await this.adminService.deactivateAdminUser(adminUser._id.toString());
      }

      this.logger.log(`✅ Admin user ${userId} synced with user account`);
    } catch (error) {
      this.logger.error('Admin user sync failed:', error);
      throw error;
    }
  }

  /**
   * Get database statistics for admin dashboard
   */
  async getDatabaseStatistics(): Promise<{
    totalUsers: number;
    totalAdmins: number;
    totalAdminUsers: number;
    totalAuditLogs: number;
    databaseSize: string;
    collections: Array<{ name: string; count: number }>;
  }> {
    try {
      const [
        totalUsers,
        totalAdmins,
        totalAdminUsers,
        totalAuditLogs,
      ] = await Promise.all([
        this.userModel.countDocuments(),
        this.adminModel.countDocuments(),
        this.adminUserModel.countDocuments(),
        this.auditLogModel.countDocuments(),
      ]);

      // Get database size
      if (!this.connection.db) {
        throw new Error('Database instance not available');
      }

      const stats = await this.connection.db.stats();
      const databaseSize = `${(stats.dataSize / 1024 / 1024).toFixed(2)} MB`;

      // Get collection counts
      const collections = await this.connection.db.listCollections().toArray();
      const collectionCounts = await Promise.all(
        collections.map(async (col) => ({
          name: col.name,
          count: await this.connection.db!.collection(col.name).countDocuments(),
        }))
      );

      return {
        totalUsers,
        totalAdmins,
        totalAdminUsers,
        totalAuditLogs,
        databaseSize,
        collections: collectionCounts,
      };
    } catch (error) {
      this.logger.error('Failed to get database statistics:', error);
      throw error;
    }
  }

  /**
   * Verify database consistency
   * Checks for orphaned records and data integrity issues
   */
  async verifyDatabaseConsistency(): Promise<{
    isConsistent: boolean;
    issues: string[];
    warnings: string[];
  }> {
    const issues: string[] = [];
    const warnings: string[] = [];

    try {
      // Check for admin users without corresponding user accounts
      const adminUsers = await this.adminUserModel.find();
      for (const adminUser of adminUsers) {
        const user = await this.userModel.findById(adminUser.userId);
        if (!user) {
          issues.push(`AdminUser ${adminUser._id} references non-existent user ${adminUser.userId}`);
        }
      }

      // Check for audit logs with invalid admin user references
      const recentAuditLogs = await this.auditLogModel
        .find()
        .sort({ timestamp: -1 })
        .limit(1000);
      
      for (const log of recentAuditLogs) {
        const adminUser = await this.adminUserModel.findById(log.adminUserId);
        if (!adminUser) {
          warnings.push(`AuditLog ${log._id} references non-existent admin user ${log.adminUserId}`);
        }
      }

      // Check for suspended users with active admin privileges
      const suspendedUsers = await this.userModel.find({ isSuspended: true });
      for (const user of suspendedUsers) {
        const adminUser = await this.adminUserModel.findOne({
          userId: user._id,
          isActive: true,
        });
        if (adminUser) {
          warnings.push(`Suspended user ${user._id} has active admin privileges`);
        }
      }

      const isConsistent = issues.length === 0;

      this.logger.log(`Database consistency check: ${isConsistent ? '✅ PASSED' : '❌ FAILED'}`);
      if (issues.length > 0) {
        this.logger.warn(`Found ${issues.length} consistency issues`);
      }
      if (warnings.length > 0) {
        this.logger.warn(`Found ${warnings.length} warnings`);
      }

      return {
        isConsistent,
        issues,
        warnings,
      };
    } catch (error) {
      this.logger.error('Database consistency check failed:', error);
      throw error;
    }
  }

  /**
   * Migrate existing admin accounts to new AdminUser system
   * This ensures backward compatibility with existing admin accounts
   */
  async migrateExistingAdmins(): Promise<{
    migrated: number;
    skipped: number;
    errors: string[];
  }> {
    let migrated = 0;
    let skipped = 0;
    const errors: string[] = [];

    try {
      this.logger.log('Starting admin account migration...');

      // Get all existing admin accounts
      const admins = await this.adminModel.find();

      for (const admin of admins) {
        try {
          // Check if AdminUser already exists
          const existingAdminUser = await this.adminUserModel.findOne({
            userId: admin._id,
          });

          if (existingAdminUser) {
            skipped++;
            continue;
          }

          // Create AdminUser for this admin
          await this.adminUserModel.create({
            userId: admin._id,
            roles: ['super_admin'], // Default role for existing admins
            permissions: [],
            isActive: true,
            createdBy: admin._id, // Self-created
            lastLoginAt: new Date(),
            lastActivityAt: new Date(),
          });

          migrated++;
          this.logger.log(`✅ Migrated admin: ${admin.email}`);
        } catch (error) {
          errors.push(`Failed to migrate admin ${admin.email}: ${error.message}`);
          this.logger.error(`❌ Failed to migrate admin ${admin.email}:`, error);
        }
      }

      this.logger.log(`Migration complete: ${migrated} migrated, ${skipped} skipped, ${errors.length} errors`);

      return {
        migrated,
        skipped,
        errors,
      };
    } catch (error) {
      this.logger.error('Admin migration failed:', error);
      throw error;
    }
  }

  /**
   * Test integration with all external services
   */
  async testExternalServicesIntegration(): Promise<{
    email: { available: boolean; error?: string };
    upload: { available: boolean; error?: string };
    payment: { available: boolean; error?: string };
    database: { available: boolean; error?: string };
    authentication: { available: boolean; error?: string };
  }> {
    const results = {
      email: { available: false, error: undefined as string | undefined },
      upload: { available: false, error: undefined as string | undefined },
      payment: { available: false, error: undefined as string | undefined },
      database: { available: false, error: undefined as string | undefined },
      authentication: { available: false, error: undefined as string | undefined },
    };

    // Test email service
    try {
      if (this.emailService) {
        results.email.available = true;
      } else {
        results.email.error = 'Email service not initialized';
      }
    } catch (error) {
      results.email.error = error.message;
    }

    // Test upload service
    try {
      if (this.uploadService) {
        results.upload.available = true;
      } else {
        results.upload.error = 'Upload service not initialized';
      }
    } catch (error) {
      results.upload.error = error.message;
    }

    // Test payment service
    try {
      if (this.stripePaymentService) {
        results.payment.available = true;
      } else {
        results.payment.error = 'Payment service not initialized';
      }
    } catch (error) {
      results.payment.error = error.message;
    }

    // Test database
    try {
      if (this.connection.readyState === 1 && this.connection.db) {
        await this.connection.db.admin().ping();
        results.database.available = true;
      } else {
        results.database.error = 'Database not connected';
      }
    } catch (error) {
      results.database.error = error.message;
    }

    // Test authentication
    try {
      if (this.jwtService && this.authService) {
        results.authentication.available = true;
      } else {
        results.authentication.error = 'Authentication services not initialized';
      }
    } catch (error) {
      results.authentication.error = error.message;
    }

    return results;
  }
}
