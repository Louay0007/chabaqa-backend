import { Injectable, ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Model, Connection } from 'mongoose';
import { InjectConnection } from '@nestjs/mongoose';
import { Admin, AdminDocument } from 'src/schema/admin.schema';
import { InjectModel } from '@nestjs/mongoose';
import { CreateAdminDto } from 'src/dto-admin/create-admin.dto';
import * as bcrypt from 'bcryptjs';
import { AdminLoginDto } from 'src/dto-admin/login.dto';

import { AdminLoginResponseDto } from 'src/dto-admin/login-response.dto';
import { VerificationCodeDocument, VerificationCodeSchema } from 'src/schema/verification-code.schema';
import { EmailService } from 'src/common/services/email.service';
import { AdminVerify2FADto } from 'src/dto-admin/verify-2fa.dto';
import { TokenBlacklistService } from 'src/common/services/token-blacklist.service';
import { AdminForgotPasswordDto } from 'src/dto-admin/forgot-password.dto';
import { AdminResetPasswordDto } from 'src/dto-admin/reset-password.dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(Admin.name) private adminModel: Model<AdminDocument>,
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
    const refreshTokenDuration = rememberMe ? '90d' : '30d';

    const accessToken = this.jwtService.sign(
      {
        ...basePayload,
        jti: accessTokenId,
      },
      {
        expiresIn: accessTokenDuration,
        secret: process.env.JWT_SECRET || 'your-secret-key',
      }
    );

    const refreshToken = this.jwtService.sign(
      {
        ...basePayload,
        jti: refreshTokenId,
      },
      {
        expiresIn: refreshTokenDuration,
        secret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key',
      }
    );

    return { accessToken, refreshToken, rememberMe };
  }

  // login admin
  async loginAdmin(loginAdminDto: AdminLoginDto): Promise<AdminLoginResponseDto> {
    const admin = await this.validateAdmin(loginAdminDto.email, loginAdminDto.password);
    // Générer et envoyer automatiquement le code 2FA
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Sauvegarder le code dans la base de données (avec expiration)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    
    // Supprimer les anciens codes pour cet utilisateur
    await this.verificationCodeModel.deleteMany({ adminId: admin._id, type: '2fa' });
    
    // Sauvegarder le nouveau code avec l'information "Remember Me"
    await this.verificationCodeModel.create({
      adminId: admin._id,
      code: verificationCode,
      type: '2fa',
      expiresAt,
      // Stocker temporairement l'option "Remember Me" dans le code
      rememberMe: loginAdminDto.remember_me || false,
    });

    // Envoyer le code par email
    await this.emailService.send2FACode(admin.email, verificationCode, '2fa');

    return {
      access_token: "",
      refresh_token: "",
      requires2FA: true,
      message: 'Code de vérification envoyé par email. Utilisez /auth/verify-2fa pour compléter la connexion.',
    };
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
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      admin: {
        _id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        createdAt: admin.createdAt,
      },
      rememberMe: rememberMe,
      message: rememberMe 
        ? 'Connexion réussie avec authentification à deux facteurs (session prolongée)'
        : 'Connexion réussie avec authentification à deux facteurs',
    };
  }
  // refresh token
  async refreshToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key',
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
        secret: process.env.JWT_SECRET || 'your-secret-key',
      });

      return {
        access_token: newAccessToken,
        expires_in: 2 * 60 * 60,
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
          secret: process.env.JWT_SECRET || 'your-secret-key',
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
          secret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key',
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
}