import { Injectable, ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Model, Connection, Types } from 'mongoose';
import { InjectConnection } from '@nestjs/mongoose';
import { Admin, AdminDocument } from '../schema/admin.schema';
import { InjectModel } from '@nestjs/mongoose';
import { CreateAdminDto } from '../dto-admin/create-admin.dto';
import * as bcrypt from 'bcryptjs';
import { AdminLoginDto } from '../dto-admin/login.dto';

import { AdminLoginResponseDto } from '../dto-admin/login-response.dto';
import { VerificationCodeDocument, VerificationCodeSchema } from '../schema/verification-code.schema';
import { EmailService } from '../common/services/email.service';
import { AdminVerify2FADto } from '../dto-admin/verify-2fa.dto';
import { TokenBlacklistService } from '../common/services/token-blacklist.service';
import { AdminForgotPasswordDto } from '../dto-admin/forgot-password.dto';
import { AdminResetPasswordDto } from '../dto-admin/reset-password.dto';
import { getJwtRefreshSecret, getJwtSecret, isProductionEnvironment } from '../common/utils/security-config.util';
import { User, UserDocument } from '../schema/user.schema';
import { UpdateAdminProfileDto } from '../dto-admin/update-admin-profile.dto';
import { ChangeAdminPasswordDto } from '../dto-admin/change-admin-password.dto';
import { UpdateAdminPreferencesDto } from '../dto-admin/update-admin-preferences.dto';

// Import new admin-specific schemas and interfaces
import { AdminUser, AdminUserDocument, AdminRole, AdminPermission } from './schemas/admin-user.schema';
import { AdminUserInfo } from './common/interfaces/admin-interfaces';

export interface AdminCapabilities {
  dashboard: boolean;
  users: boolean;
  communities: boolean;
  contentModeration: boolean;
  contentManagement: boolean;
  financial: boolean;
  analytics: boolean;
  security: boolean;
  communication: boolean;
  liveSupport: boolean;
  settings: boolean;
}

export interface AdminSessionPayload {
  admin: {
    _id: string;
    name: string;
    email: string;
    role: string;
    createdAt: Date;
    twoFactorEnabled: boolean;
  };
  roles: string[];
  permissions: string[];
  capabilities: AdminCapabilities;
}

export interface AdminPreferences {
  theme: 'light' | 'dark' | 'system';
  locale: string;
  timezone: string;
  emailNotifications: boolean;
}

const DEFAULT_ADMIN_PREFERENCES: AdminPreferences = {
  theme: 'system',
  locale: 'en',
  timezone: 'UTC',
  emailNotifications: true,
};

const FULL_ADMIN_CAPABILITIES: AdminCapabilities = {
  dashboard: true,
  users: true,
  communities: true,
  contentModeration: true,
  contentManagement: true,
  financial: true,
  analytics: true,
  security: true,
  communication: true,
  liveSupport: true,
  settings: true,
};

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(Admin.name) private adminModel: Model<AdminDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(AdminUser.name) private adminUserModel: Model<AdminUserDocument>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly tokenBlacklistService: TokenBlacklistService,
    @InjectModel('VerificationCode') private verificationCodeModel: Model<VerificationCodeDocument>,
    @InjectConnection() private connection: Connection,
  ) {}

  // check if admin exists
  async checkAdminExists(email: string, name: string): Promise<{ emailExists: boolean; nameExists: boolean }> {
    const emailExists = await this.adminModel.findOne({ email: email.toLowerCase() });
    const nameExists = await this.adminModel.findOne({ name: name });
    
    return {
      emailExists: !!emailExists,
      nameExists: !!nameExists
    };
  }

  // hash password
  private async hashPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return bcrypt.hash(password, saltRounds);
  }

  // create admin
  async createAdmin(createAdminDto: CreateAdminDto): Promise<Admin> {
    const { emailExists, nameExists } = await this.checkAdminExists(createAdminDto.email, createAdminDto.name);

    if (emailExists) {
      throw new ConflictException(`L'email '${createAdminDto.email}' est déjà utilisé par un autre compte`);
    }

    if (nameExists) {
      throw new ConflictException(`Le nom '${createAdminDto.name}' est déjà utilisé par un autre compte`);
    }

    const hashedPassword = await this.hashPassword(createAdminDto.password);
    const newAdmin = await new this.adminModel({
      ...createAdminDto,
      password: hashedPassword,
    });
    return newAdmin.save();
  }
  async validateAdmin(email: string, password: string): Promise<AdminDocument> {
    const admin = await this.adminModel.findOne({ email: email.toLowerCase() }).select('+password');
    if (!admin) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }
    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }
    return admin;
  }

  private generateTokens(admin: AdminDocument, rememberMe: boolean = false) {
    const currentTime = Date.now();
    const accessTokenId = `${admin._id}-access-${currentTime}`;
    const refreshTokenId = `${admin._id}-refresh-${currentTime}`;

    const basePayload = {
      sub: admin._id,
      email: admin.email,
      role: admin.role,
    };

    const accessTokenDuration = rememberMe ? '4h' : '2h';
    const refreshTokenDuration = rememberMe ? '30d' : '7d';

    const accessToken = this.jwtService.sign(
      {
        ...basePayload,
        jti: accessTokenId,
      },
      {
        expiresIn: accessTokenDuration,
        secret: getJwtSecret(),
      }
    );

    const refreshToken = this.jwtService.sign(
      {
        ...basePayload,
        jti: refreshTokenId,
      },
      {
        expiresIn: refreshTokenDuration,
        secret: getJwtRefreshSecret(),
      }
    );

    return { accessToken, refreshToken, rememberMe };
  }

  private buildCapabilities(
    roles: string[] = [],
    permissions: string[] = [],
  ): AdminCapabilities {
    if (
      roles.includes(AdminRole.SUPER_ADMIN) ||
      roles.includes('admin') ||
      roles.includes('super_admin') ||
      permissions.includes('*')
    ) {
      return { ...FULL_ADMIN_CAPABILITIES };
    }

    const capabilityRules: Record<keyof AdminCapabilities, { roles?: string[]; permissions?: string[] }> = {
      dashboard: { roles: [AdminRole.SUPER_ADMIN], permissions: [] },
      users: {
        roles: [AdminRole.SUPER_ADMIN, AdminRole.USER_MANAGER],
        permissions: [
          AdminPermission.VIEW_USERS,
          AdminPermission.USER_READ,
          AdminPermission.USER_CREATE,
          AdminPermission.USER_UPDATE,
          AdminPermission.USER_DELETE,
        ],
      },
      communities: {
        roles: [AdminRole.SUPER_ADMIN, AdminRole.COMMUNITY_MANAGER],
        permissions: [
          AdminPermission.VIEW_COMMUNITIES,
          AdminPermission.APPROVE_COMMUNITIES,
          AdminPermission.REJECT_COMMUNITIES,
          AdminPermission.MODERATE_COMMUNITIES,
        ],
      },
      contentModeration: {
        roles: [AdminRole.SUPER_ADMIN, AdminRole.CONTENT_MODERATOR, AdminRole.ANALYTICS_VIEWER],
        permissions: [
          AdminPermission.VIEW_CONTENT_QUEUE,
          AdminPermission.APPROVE_CONTENT,
          AdminPermission.REJECT_CONTENT,
          AdminPermission.BULK_MODERATE_CONTENT,
        ],
      },
      contentManagement: {
        roles: [AdminRole.SUPER_ADMIN, AdminRole.CONTENT_MODERATOR],
        permissions: [
          AdminPermission.VIEW_CONTENT_QUEUE,
          AdminPermission.APPROVE_CONTENT,
          AdminPermission.REJECT_CONTENT,
          AdminPermission.BULK_MODERATE_CONTENT,
        ],
      },
      financial: {
        roles: [AdminRole.SUPER_ADMIN, AdminRole.FINANCIAL_MANAGER],
        permissions: [
          AdminPermission.VIEW_FINANCIAL_DATA,
          AdminPermission.PROCESS_PAYOUTS,
          AdminPermission.HANDLE_DISPUTES,
          AdminPermission.GENERATE_FINANCIAL_REPORTS,
        ],
      },
      analytics: {
        roles: [
          AdminRole.SUPER_ADMIN,
          AdminRole.ANALYTICS_VIEWER,
          AdminRole.USER_MANAGER,
          AdminRole.COMMUNITY_MANAGER,
          AdminRole.FINANCIAL_MANAGER,
        ],
        permissions: [
          AdminPermission.VIEW_ANALYTICS,
          AdminPermission.ANALYTICS_READ,
          AdminPermission.EXPORT_DATA,
          AdminPermission.CONFIGURE_ALERTS,
        ],
      },
      security: {
        roles: [AdminRole.SUPER_ADMIN, AdminRole.SECURITY_AUDITOR],
        permissions: [AdminPermission.VIEW_AUDIT_LOGS, AdminPermission.EXPORT_AUDIT_LOGS],
      },
      communication: {
        roles: [AdminRole.SUPER_ADMIN],
        permissions: [
          AdminPermission.SEND_BULK_MESSAGES,
          AdminPermission.MANAGE_EMAIL_CAMPAIGNS,
          AdminPermission.MANAGE_NOTIFICATIONS,
        ],
      },
      liveSupport: {
        roles: [AdminRole.SUPER_ADMIN],
        permissions: [AdminPermission.MANAGE_NOTIFICATIONS],
      },
      settings: { roles: [AdminRole.SUPER_ADMIN], permissions: [AdminPermission.MANAGE_ADMIN_USERS] },
    };

    const hasAny = (candidates: string[] = []) => candidates.some((candidate) => roles.includes(candidate) || permissions.includes(candidate));

    return {
      dashboard: true,
      users: hasAny([...(capabilityRules.users.roles || []), ...(capabilityRules.users.permissions || [])]),
      communities: hasAny([...(capabilityRules.communities.roles || []), ...(capabilityRules.communities.permissions || [])]),
      contentModeration: hasAny([...(capabilityRules.contentModeration.roles || []), ...(capabilityRules.contentModeration.permissions || [])]),
      contentManagement: hasAny([...(capabilityRules.contentManagement.roles || []), ...(capabilityRules.contentManagement.permissions || [])]),
      financial: hasAny([...(capabilityRules.financial.roles || []), ...(capabilityRules.financial.permissions || [])]),
      analytics: hasAny([...(capabilityRules.analytics.roles || []), ...(capabilityRules.analytics.permissions || [])]),
      security: hasAny([...(capabilityRules.security.roles || []), ...(capabilityRules.security.permissions || [])]),
      communication: hasAny([...(capabilityRules.communication.roles || []), ...(capabilityRules.communication.permissions || [])]),
      liveSupport: hasAny([...(capabilityRules.liveSupport.roles || []), ...(capabilityRules.liveSupport.permissions || [])]),
      settings: true,
    };
  }

  private buildLegacyAdminInfo(admin: AdminDocument): AdminUserInfo {
    return {
      _id: admin._id,
      userId: admin._id,
      roles: [AdminRole.SUPER_ADMIN],
      permissions: ['*'],
      isActive: true,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      authSource: 'legacy_admin',
      capabilities: { ...FULL_ADMIN_CAPABILITIES },
      user: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        createdAt: admin.createdAt,
      },
    };
  }

  private buildSessionPayloadFromAdminInfo(adminInfo: AdminUserInfo): AdminSessionPayload {
    const roles = [...new Set((adminInfo.roles || []).map((role) => String(role)))];
    const permissions = [...new Set((adminInfo.permissions || []).map((permission) => String(permission)))];
    const capabilities = adminInfo.capabilities || this.buildCapabilities(roles, permissions);
    const adminProfile = adminInfo.user;

    return {
      admin: {
        _id: String(adminProfile?._id || adminInfo._id),
        name: adminProfile?.name || adminInfo.name || 'Admin',
        email: adminProfile?.email || adminInfo.email || '',
        role: adminInfo.role || adminProfile?.role || roles[0] || 'admin',
        createdAt: adminProfile?.createdAt || adminInfo.lastLoginAt || adminInfo.lastActivityAt || new Date(),
        twoFactorEnabled: process.env.ADMIN_ALLOW_PASSWORD_ONLY_LOGIN !== 'true',
      },
      roles,
      permissions,
      capabilities,
    };
  }

  buildAdminSessionPayload(adminInfo: AdminUserInfo): AdminSessionPayload {
    return this.buildSessionPayloadFromAdminInfo(adminInfo);
  }

  async getAdminSessionForLegacyAdmin(adminId: string): Promise<AdminSessionPayload> {
    const admin = await this.adminModel.findById(adminId);

    if (!admin) {
      throw new UnauthorizedException('Administrateur non trouvé');
    }

    return this.buildSessionPayloadFromAdminInfo(this.buildLegacyAdminInfo(admin));
  }

  async getAdminSessionForRequestUser(user: any): Promise<AdminSessionPayload> {
    const userId = String(user?.id || user?._id || user?.userId || user?.sub || '');

    if (!user || !userId) {
      throw new UnauthorizedException('Invalid user token');
    }

    if (user.isAdmin === true) {
      return this.getAdminSessionForLegacyAdmin(userId);
    }

    const adminUser = await this.getAdminUser(userId);
    if (!adminUser || !adminUser.isActive) {
      throw new UnauthorizedException('Admin account is inactive');
    }

    return this.buildSessionPayloadFromAdminInfo(adminUser);
  }

  async getAdminContextForRequestUser(user: any): Promise<AdminUserInfo> {
    const userId = String(user?.id || user?._id || user?.userId || user?.sub || '');

    if (!user || !userId) {
      throw new UnauthorizedException('Invalid user token');
    }

    if (user.isAdmin === true) {
      const admin = await this.adminModel.findById(userId);
      if (!admin) {
        throw new UnauthorizedException('Administrateur non trouvé');
      }
      return this.buildLegacyAdminInfo(admin);
    }

    const adminUser = await this.getAdminUser(userId);
    if (!adminUser || !adminUser.isActive) {
      throw new UnauthorizedException('Admin account is inactive');
    }

    return {
      ...adminUser,
      authSource: 'admin_user',
      capabilities: this.buildCapabilities(
        (adminUser.roles || []).map((role) => String(role)),
        (adminUser.permissions || []).map((permission) => String(permission)),
      ),
    };
  }

  async updateAdminProfile(user: any, updateProfileDto: UpdateAdminProfileDto): Promise<AdminSessionPayload> {
    const nextName = updateProfileDto.name?.trim();
    const nextEmail = updateProfileDto.email?.trim().toLowerCase();

    if (!nextName && !nextEmail) {
      throw new BadRequestException('At least one field (name or email) must be provided');
    }

    const adminContext = await this.getAdminContextForRequestUser(user);

    if (nextEmail) {
      if (adminContext.authSource === 'legacy_admin') {
        const existingLegacyAdmin = await this.adminModel.findOne({
          email: nextEmail,
          _id: { $ne: adminContext._id },
        });
        if (existingLegacyAdmin) {
          throw new ConflictException(`L'email '${nextEmail}' est déjà utilisé par un autre compte`);
        }
      } else {
        const existingUser = await this.userModel.findOne({
          email: nextEmail,
          _id: { $ne: adminContext.userId },
        });
        if (existingUser) {
          throw new ConflictException(`L'email '${nextEmail}' est déjà utilisé par un autre compte`);
        }
      }
    }

    if (adminContext.authSource === 'legacy_admin') {
      const updateData: Partial<AdminDocument> = {};
      if (nextName) updateData.name = nextName;
      if (nextEmail) updateData.email = nextEmail;

      await this.adminModel.findByIdAndUpdate(adminContext._id, updateData, { new: true }).exec();
    } else {
      const updateData: Partial<UserDocument> = {};
      if (nextName) updateData.name = nextName;
      if (nextEmail) updateData.email = nextEmail;

      await this.userModel.findByIdAndUpdate(adminContext.userId, updateData, { new: true }).exec();
    }

    return this.getAdminSessionForRequestUser(user);
  }

  async changeAdminPassword(user: any, changePasswordDto: ChangeAdminPasswordDto): Promise<{ message: string }> {
    const { currentPassword, newPassword } = changePasswordDto;
    const adminContext = await this.getAdminContextForRequestUser(user);

    if (currentPassword === newPassword) {
      throw new BadRequestException('New password must be different from current password');
    }

    if (adminContext.authSource === 'legacy_admin') {
      const admin = await this.adminModel.findById(adminContext._id).select('+password').exec();
      if (!admin) {
        throw new UnauthorizedException('Administrateur non trouvé');
      }

      const isPasswordValid = await bcrypt.compare(currentPassword, admin.password);
      if (!isPasswordValid) {
        throw new UnauthorizedException('Current password is incorrect');
      }

      admin.password = await this.hashPassword(newPassword);
      await admin.save();
      return { message: 'Password updated successfully' };
    }

    const account = await this.userModel.findById(adminContext.userId).select('+password').exec();
    if (!account) {
      throw new UnauthorizedException('Admin account not found');
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, account.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    account.password = await this.hashPassword(newPassword);
    await account.save();

    return { message: 'Password updated successfully' };
  }

  async getAdminPreferences(user: any): Promise<AdminPreferences> {
    const adminContext = await this.getAdminContextForRequestUser(user);

    if (adminContext.authSource === 'legacy_admin') {
      const admin = await this.adminModel.findById(adminContext._id).lean().exec();
      const saved = admin?.adminPreferences || {};
      return {
        ...DEFAULT_ADMIN_PREFERENCES,
        ...saved,
      };
    }

    const adminUser = await this.adminUserModel.findById(adminContext._id).lean().exec();
    const saved = (adminUser?.metadata?.preferences || {}) as Partial<AdminPreferences>;
    return {
      ...DEFAULT_ADMIN_PREFERENCES,
      ...saved,
    };
  }

  async updateAdminPreferences(
    user: any,
    updatePreferencesDto: UpdateAdminPreferencesDto,
  ): Promise<AdminPreferences> {
    const adminContext = await this.getAdminContextForRequestUser(user);
    const current = await this.getAdminPreferences(user);
    const next: AdminPreferences = {
      ...current,
      ...updatePreferencesDto,
    };

    if (adminContext.authSource === 'legacy_admin') {
      await this.adminModel.findByIdAndUpdate(
        adminContext._id,
        { adminPreferences: next },
        { new: true },
      ).exec();
      return next;
    }

    await this.adminUserModel.findByIdAndUpdate(
      adminContext._id,
      { $set: { 'metadata.preferences': next } },
      { new: true },
    ).exec();
    return next;
  }

  // login admin
  async loginAdmin(loginAdminDto: AdminLoginDto): Promise<AdminLoginResponseDto> {
    const admin = await this.validateAdmin(loginAdminDto.email, loginAdminDto.password);

    const shouldRequire2FA =
      isProductionEnvironment() && process.env.ADMIN_ALLOW_PASSWORD_ONLY_LOGIN !== 'true';

    if (shouldRequire2FA) {
      const verificationCode = this.generateVerificationCode();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      await this.verificationCodeModel.deleteMany({ adminId: admin._id, type: '2fa' });
      await this.verificationCodeModel.create({
        adminId: admin._id,
        code: verificationCode,
        type: '2fa',
        expiresAt,
        isUsed: false,
        rememberMe: Boolean(loginAdminDto.remember_me),
      });

      await this.emailService.send2FACode(admin.email, verificationCode, admin.name);

      return {
        requires2FA: true,
        message: 'Code de vérification envoyé. Veuillez confirmer le 2FA.',
      } as AdminLoginResponseDto;
    }

    const { accessToken, refreshToken, rememberMe } = this.generateTokens(admin, loginAdminDto.remember_me);
    const session = await this.getAdminSessionForLegacyAdmin(admin._id.toString());

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      requires2FA: false,
      admin: session.admin,
      roles: session.roles,
      permissions: session.permissions,
      capabilities: session.capabilities,
      rememberMe,
      message: 'Connexion réussie',
    };
  }

  async hasAnyAdminAccount(): Promise<boolean> {
    return (await this.adminModel.countDocuments({})) > 0;
  }

  // verify 2fa
  async verify2FA(verify2FADto: AdminVerify2FADto): Promise<AdminLoginResponseDto> {
    const { email, verificationCode } = verify2FADto;
    // Vérifier si l'utilisateur existe
    const admin = await this.adminModel.findOne({ email: email.toLowerCase() });
    if (!admin) {
      throw new BadRequestException('Email invalide');
    }
    // Vérifier le code 2FA
    const verificationCodeData = await this.verificationCodeModel.findOne({ 
      adminId: admin._id, 
      code: verificationCode, 
      type: '2fa', 
      expiresAt: { $gt: new Date() } 
    });
    if (!verificationCodeData) {
      throw new BadRequestException('Code de vérification invalide');
    }
    // Vérifier si le code est expiré
    if (verificationCodeData.expiresAt < new Date()) {
      throw new BadRequestException('Code de vérification expiré');
    }
    // Récupérer l'option "Remember Me" du code de vérification
    const rememberMe = verificationCodeData.rememberMe || false;
    // Supprimer le code utilisé
    await this.verificationCodeModel.deleteOne({ _id: verificationCodeData._id });
    // Générer les tokens
    const { accessToken, refreshToken } = this.generateTokens(admin, rememberMe);
    const session = await this.getAdminSessionForLegacyAdmin(admin._id.toString());
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      admin: session.admin,
      roles: session.roles,
      permissions: session.permissions,
      capabilities: session.capabilities,
      rememberMe: rememberMe,
      message: rememberMe 
        ? 'Connexion réussie avec authentification à deux facteurs (session prolongée)'
        : 'Connexion réussie avec authentification à deux facteurs',
    };
  }
  // refresh token
  async refreshToken(refreshToken: string): Promise<{
    access_token: string;
    expires_in: number;
    admin: AdminSessionPayload['admin'];
    roles: string[];
    permissions: string[];
    capabilities: AdminCapabilities;
  }> {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: getJwtRefreshSecret(),
      });
      // Vérifier si le token est dans la blacklist
      const tokenId = payload.jti || `${payload.sub}-${payload.iat}`;
      const isRevoked = await this.tokenBlacklistService.isTokenRevoked(tokenId);

      if (isRevoked) {
        throw new UnauthorizedException('Token de rafraîchissement révoqué');
      }

      const admin = await this.adminModel.findById(payload.sub);
      if (!admin) {
        throw new UnauthorizedException('Utilisateur non trouvé');
      }

      const currentTime = Date.now();
      const newAccessTokenId = `${admin._id}-access-${currentTime}`;

      const newPayload = {
        ...payload,
        jti: newAccessTokenId,
      };

      const newAccessToken = this.jwtService.sign(newPayload, {
        expiresIn: '2h',
        secret: getJwtSecret(),
      });
      const session = await this.getAdminSessionForLegacyAdmin(admin._id.toString());

      return {
        access_token: newAccessToken,
        expires_in: 2 * 60 * 60,
        admin: session.admin,
        roles: session.roles,
        permissions: session.permissions,
        capabilities: session.capabilities,
      };
    } catch (error) {
      throw new UnauthorizedException('Token de rafraîchissement invalide');
    }
  }
  // logout admin
  async logout(accessToken?: string, refreshToken?: string): Promise<{ message: string; revokedTokens: number }> {
    let revokedCount = 0;

    try {
      // Révoquer l'access token s'il est fourni
      if (accessToken) {
        const accessPayload = this.jwtService.verify(accessToken, {
          secret: getJwtSecret(),
        });
        await this.tokenBlacklistService.revokeTokenFromJWT(
          accessPayload.sub,
          accessPayload,
          'access'
        );
        revokedCount++;
      }
      // Révoquer le refresh token s'il est fourni
      if (refreshToken) {
        const refreshPayload = this.jwtService.verify(refreshToken, {
          secret: getJwtRefreshSecret(),
        });
        await this.tokenBlacklistService.revokeTokenFromJWT(
          refreshPayload.sub,
          refreshPayload,
          'refresh'
        );
        revokedCount++;
      }
      return {
        message: `Déconnexion réussie. ${revokedCount} token(s) révoqué(s).`,
        revokedTokens: revokedCount,
      };
    } catch (error) {
      // Même si la révocation échoue, on considère la déconnexion comme réussie
      return {
        message: 'Déconnexion réussie (tokens expirés ou invalides).',
        revokedTokens: revokedCount,
      };
    }
  }
  // generate verification code
  private generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
  // forgot password
  async forgotPassword(forgotPasswordDto: AdminForgotPasswordDto): Promise<{ message: string }> {
    const { email } = forgotPasswordDto;
    const admin = await this.adminModel.findOne({ email: email.toLowerCase() });
    if (!admin) {
      return { message: 'Si cet email existe dans notre base de données, vous recevrez un code de vérification.' };
    }
    // Supprimer les anciens codes de vérification pour cet email
    await this.verificationCodeModel.deleteMany({ email: email.toLowerCase(), type: 'password_reset' });
    // Générer un nouveau code de vérification
    const verificationCode = this.generateVerificationCode();
    // Sauvegarder le code dans la base de données (avec expiration)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    await new this.verificationCodeModel({
      adminId: admin._id,
      code: verificationCode,
      type: 'password_reset',
      expiresAt,
      isUsed: false,
    }).save();
    // Envoyer le code par email
    try {
      await this.emailService.sendPasswordResetEmail(admin.email, verificationCode, admin.name);
    } catch (error) {
      // Supprimer le code si l'envoi d'email échoue
      await this.verificationCodeModel.deleteOne({ email: email.toLowerCase(), code: verificationCode });
      throw new BadRequestException(`Erreur lors de l'envoi de l'email: ${error.message}`);
    }
    return { message: 'Si cet email existe dans notre base de données, vous recevrez un code de vérification.' };
  }

  // reset password
  async resetPassword(resetPasswordDto: AdminResetPasswordDto): Promise<{ message: string }> {
    const { email, verificationCode, newPassword } = resetPasswordDto;
    const admin = await this.adminModel.findOne({ email: email.toLowerCase() });
    if (!admin) {
      throw new BadRequestException('Email ou code de vérification invalide');
    }
    // Vérifier le code de vérification
    const codeDoc = await this.verificationCodeModel.findOne({
      email: email.toLowerCase(),
      code: verificationCode,
      type: 'password_reset',
      isUsed: false,
      expiresAt: { $gt: new Date() }
    });
    if (!codeDoc) {
      throw new BadRequestException('Code de vérification invalide ou expiré');
    }
    // Vérifier si le code est expiré
    if (codeDoc.expiresAt < new Date()) {
      throw new BadRequestException('Code de vérification expiré');
    }
    // Vérifier si le code a déjà été utilisé
    if (codeDoc.isUsed) {
      throw new BadRequestException('Code de vérification déjà utilisé');
    }
    // Marquer le code comme utilisé
    await this.verificationCodeModel.findByIdAndUpdate(codeDoc._id, { isUsed: true });
    // Hacher le nouveau mot de passe
    const hashedPassword = await this.hashPassword(newPassword);
    // Mettre à jour le mot de passe dans la base de données
    await this.adminModel.findByIdAndUpdate(admin._id, { password: hashedPassword });
    // Supprimer tous les codes de vérification pour cet email
    await this.verificationCodeModel.deleteMany({ email: email.toLowerCase() });
    return { message: 'Mot de passe réinitialisé avec succès' };
  }

  // ⚠️ DANGER: Delete all database data
  async cleanupDatabase(): Promise<{ deletedCollections: string[] }> {
    try {
      if (!this.connection.db) {
        throw new BadRequestException('Database connection not available');
      }

      const collections = await this.connection.db.listCollections().toArray();
      const deletedCollections: string[] = [];

      for (const collection of collections) {
        const collectionName = collection.name;
        if (collectionName && this.connection.db) {
          await this.connection.db.collection(collectionName).deleteMany({});
          deletedCollections.push(collectionName);
        }
      }

      return { deletedCollections };
    } catch (error) {
      throw new BadRequestException(`Failed to cleanup database: ${error.message}`);
    }
  }

  // ===== ENHANCED ADMIN USER MANAGEMENT =====

  /**
   * Check if a user has admin privileges
   * @param userId - User ID to check
   */
  async isAdminUser(userId: string): Promise<boolean> {
    try {
      const adminUser = await this.adminUserModel.findOne({ 
        userId: new Types.ObjectId(userId),
        isActive: true 
      });
      return !!adminUser;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get admin user details by user ID
   * @param userId - User ID
   */
  async getAdminUser(userId: string): Promise<AdminUserInfo | null> {
    try {
      const adminUser = await this.adminUserModel
        .findOne({ 
          userId: new Types.ObjectId(userId),
          isActive: true 
        })
        .populate('userId', 'name email role createdAt')
        .exec();

      if (!adminUser) {
        return null;
      }

      return {
        _id: adminUser._id,
        userId: adminUser.userId,
        roles: adminUser.roles.map((role) => String(role)),
        permissions: adminUser.permissions,
        isActive: adminUser.isActive,
        lastLoginAt: adminUser.lastLoginAt,
        lastActivityAt: adminUser.lastActivityAt,
        email: (adminUser.userId as any)?.email,
        name: (adminUser.userId as any)?.name,
        role: (adminUser.roles?.[0] as string) || (adminUser.userId as any)?.role,
        authSource: 'admin_user',
        user: adminUser.userId as any,
      };
    } catch (error) {
      console.error('Error getting admin user:', error);
      return null;
    }
  }

  /**
   * Create a new admin user
   * @param userId - User ID to grant admin privileges
   * @param roles - Admin roles to assign
   * @param permissions - Additional permissions to assign
   * @param createdBy - Admin user who is creating this admin user
   */
  async createAdminUser(
    userId: string,
    roles: AdminRole[],
    permissions: AdminPermission[] = [],
    createdBy: string,
  ): Promise<AdminUser> {
    try {
      // Check if admin user already exists
      const existingAdminUser = await this.adminUserModel.findOne({ 
        userId: new Types.ObjectId(userId) 
      });

      if (existingAdminUser) {
        throw new ConflictException('User already has admin privileges');
      }

      const adminUser = new this.adminUserModel({
        userId: new Types.ObjectId(userId),
        roles,
        permissions,
        isActive: true,
        createdBy: new Types.ObjectId(createdBy),
      });

      return await adminUser.save();
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      throw new BadRequestException(`Failed to create admin user: ${error.message}`);
    }
  }

  /**
   * Update admin user roles and permissions
   * @param adminUserId - Admin user ID
   * @param roles - New roles
   * @param permissions - New permissions
   */
  async updateAdminUser(
    adminUserId: string,
    roles?: AdminRole[],
    permissions?: AdminPermission[],
  ): Promise<AdminUser> {
    try {
      const updateData: any = {};
      
      if (roles) {
        updateData.roles = roles;
      }
      
      if (permissions) {
        updateData.permissions = permissions;
      }

      const updatedAdminUser = await this.adminUserModel
        .findByIdAndUpdate(
          adminUserId,
          updateData,
          { new: true }
        )
        .populate('userId', 'name email role')
        .exec();

      if (!updatedAdminUser) {
        throw new BadRequestException('Admin user not found');
      }

      return updatedAdminUser;
    } catch (error) {
      throw new BadRequestException(`Failed to update admin user: ${error.message}`);
    }
  }

  /**
   * Deactivate an admin user
   * @param adminUserId - Admin user ID
   */
  async deactivateAdminUser(adminUserId: string): Promise<void> {
    try {
      const result = await this.adminUserModel.findByIdAndUpdate(
        adminUserId,
        { isActive: false },
        { new: true }
      );

      if (!result) {
        throw new BadRequestException('Admin user not found');
      }
    } catch (error) {
      throw new BadRequestException(`Failed to deactivate admin user: ${error.message}`);
    }
  }

  /**
   * Update last activity timestamp for an admin user
   * @param adminUserId - Admin user ID
   */
  async updateLastActivity(adminUserId: string): Promise<void> {
    try {
      await this.adminUserModel.findByIdAndUpdate(
        adminUserId,
        { lastActivityAt: new Date() }
      );
    } catch (error) {
      // Don't throw errors for activity updates to avoid breaking main operations
      console.error('Failed to update admin user activity:', error);
    }
  }

  /**
   * Update last login timestamp for an admin user
   * @param userId - User ID
   */
  async updateLastLogin(userId: string): Promise<void> {
    try {
      await this.adminUserModel.findOneAndUpdate(
        { userId: new Types.ObjectId(userId) },
        { lastLoginAt: new Date() }
      );
    } catch (error) {
      // Don't throw errors for login updates to avoid breaking main operations
      console.error('Failed to update admin user login:', error);
    }
  }

  /**
   * Get all admin users with pagination
   * @param page - Page number
   * @param limit - Items per page
   */
  async getAdminUsers(page: number = 1, limit: number = 20): Promise<{
    data: AdminUser[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      const skip = (page - 1) * limit;

      const [data, total] = await Promise.all([
        this.adminUserModel
          .find()
          .populate('userId', 'name email role')
          .populate('createdBy', 'userId')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .exec(),
        this.adminUserModel.countDocuments(),
      ]);

      return {
        data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      throw new BadRequestException(`Failed to get admin users: ${error.message}`);
    }
  }

  /**
   * Check if admin user has specific role
   * @param userId - User ID
   * @param role - Role to check
   */
  async hasAdminRole(userId: string, role: AdminRole): Promise<boolean> {
    try {
      const adminUser = await this.adminUserModel.findOne({
        userId: new Types.ObjectId(userId),
        isActive: true,
        roles: role,
      });
      return !!adminUser;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if admin user has specific permission
   * @param userId - User ID
   * @param permission - Permission to check
   */
  async hasAdminPermission(userId: string, permission: AdminPermission): Promise<boolean> {
    try {
      const adminUser = await this.adminUserModel.findOne({
        userId: new Types.ObjectId(userId),
        isActive: true,
        permissions: permission,
      });
      return !!adminUser;
    } catch (error) {
      return false;
    }
  }
}
