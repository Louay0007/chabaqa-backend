import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { User, UserDocument } from '../schema/user.schema';
import { LoginDto } from '../dto-user/login.dto';
import { LoginResponseDto } from '../dto-user/login-response.dto';
import { EmailService } from '../common/services/email.service';
import { VerificationCodeSchema } from '../schema/verification-code.schema';
import { UserLoginActivityService } from '../user-login-activity/user-login-activity.service';
import { RegisterDto } from '../dto-user/register.dto';
import { UploadService } from '../upload/upload.service';
import { generateUniqueUsername } from '../common/utils/username.util';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
    private emailService: EmailService,
    private userLoginActivityService: UserLoginActivityService,
    private uploadService: UploadService,
  ) { }

  async loginWithGoogle(oauthUser: {
    provider: 'google';
    providerId: string;
    email?: string;
    name?: string;
    photo?: string;
  }): Promise<LoginResponseDto> {
    if (!oauthUser.email) {
      throw new BadRequestException('Adresse e-mail Google introuvable');
    }

    let user = await this.userModel.findOne({ email: oauthUser.email.toLowerCase() });

    if (!user) {
      const candidateName = String(oauthUser.name || 'Google User').trim() || 'Google User';
      const passwordHash = await this.hashPassword(`google:${oauthUser.providerId}:${Date.now()}`);
      const username = await generateUniqueUsername(this.userModel, candidateName);
      user = await this.userModel.create({
        name: candidateName,
        username,
        email: oauthUser.email.toLowerCase(),
        role: 'user',
        password: passwordHash,
      });
    }

    const accessToken = this.generateToken(user);

    await this.userLoginActivityService.trackUserLoginForAllCommunities(user._id.toString());

    const userDto = {
      _id: user._id.toString(),
      name: user.name,
      username: (user as any).username,
      email: user.email,
      role: user.role,
      avatar: this.uploadService.ensureAbsoluteUrl(user.profile_picture || user.photo_profil || ''),
      createdAt: user.createdAt,
    };
    return {
      access_token: accessToken,
      refresh_token: '', // Deprecated
      user: userDto,
      rememberMe: true,
      message: 'Connexion réussie avec Google',
    };
  }

  async loginWithGoogleMobile(idToken: string): Promise<LoginResponseDto> {
    const googleAuthClientId = process.env.GOOGLE_AUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
    const client = new OAuth2Client(googleAuthClientId);
    const ticket = await client.verifyIdToken({
      idToken: idToken,
      audience: googleAuthClientId,
    });
    const payload = ticket.getPayload();
    if (!payload) {
      throw new UnauthorizedException('Invalid Google ID token');
    }
    const googleUser = {
      provider: 'google' as const,
      providerId: payload.sub,
      email: payload.email,
      name: payload.name,
      photo: payload.picture,
    };
    return this.loginWithGoogle(googleUser);
  }

  async validateUser(email: string, password: string): Promise<UserDocument> {
    const user = await this.userModel.findOne({ email }).select('+password');
    if (!user) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }
    return user;
  }

  public generateToken(user: UserDocument): string {
    const payload = {
      sub: user._id,
      email: user.email,
      role: user.role,
    };

    return this.jwtService.sign(payload, {
      expiresIn: '7d', // Longer expiration for simple auth
      secret: process.env.JWT_SECRET || 'your-secret-key',
    });
  }

  async login(loginDto: LoginDto): Promise<{ accessToken: string; user: any }> {
    const user = await this.validateUser(loginDto.email, loginDto.password);

    const accessToken = this.generateToken(user);
    await this.userLoginActivityService.trackUserLoginForAllCommunities(user._id.toString());

    const userDto = {
      _id: user._id.toString(),
      name: user.name,
      username: (user as any).username,
      email: user.email,
      role: user.role,
      avatar: this.uploadService.ensureAbsoluteUrl(user.profile_picture || user.photo_profil || ''),
      createdAt: user.createdAt,
    };

    return {
      accessToken,
      user: userDto
    };
  }

  async getUserById(userId: string): Promise<UserDocument | null> {
    const user = await this.userModel.findById(userId).select('-password').exec();
    if (!user) return null;
    
    // Transform the user data to match frontend expectations
    const userObject = user.toObject();

    // Normalize upload URLs to HTTPS production domain to prevent mixed-content issues
    const normalizedPhotoProfil = this.uploadService.ensureAbsoluteUrl(userObject.photo_profil || '');
    const normalizedProfilePicture = this.uploadService.ensureAbsoluteUrl(userObject.profile_picture || '');
    const normalizedAvatar = this.uploadService.ensureAbsoluteUrl(
      userObject.profile_picture || userObject.photo_profil || ''
    );
    
    // Map backend photo fields to frontend avatar field
    return {
      ...userObject,
      photo_profil: normalizedPhotoProfil,
      profile_picture: normalizedProfilePicture,
      avatar: normalizedAvatar,
      firstName: userObject.name, // Map name to firstName for frontend compatibility
    } as any;
  }

  async hashPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return bcrypt.hash(password, saltRounds);
  }

  async forgotPassword(email: string): Promise<{ success: boolean; message?: string; error?: string }> {
    const user = await this.userModel.findOne({ email: email.toLowerCase() });
    if (!user) {
      return { success: false, error: "Aucun utilisateur trouvé avec cet email." };
    }
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const verificationCodeModel = this.userModel.db.model('VerificationCode', VerificationCodeSchema);
    await verificationCodeModel.deleteMany({ userId: user._id, type: 'password_reset' });
    await verificationCodeModel.create({
      userId: user._id,
      code: resetCode,
      type: 'password_reset',
      expiresAt,
    });
    await this.emailService.send2FACode(user.email, resetCode, user.name);
    return { success: true, message: "Code de réinitialisation envoyé par email." };
  }

  async resetPassword(email: string, code: string, newPassword: string): Promise<{ success: boolean; message?: string; error?: string }> {
    const user = await this.userModel.findOne({ email: email.toLowerCase() });
    if (!user) {
      return { success: false, error: "Aucun utilisateur trouvé avec cet email." };
    }
    const verificationCodeModel = this.userModel.db.model('VerificationCode', VerificationCodeSchema);
    const verificationRecord = await verificationCodeModel.findOne({
      userId: user._id,
      code,
      type: 'password_reset',
      expiresAt: { $gt: new Date() },
    });
    if (!verificationRecord) {
      return { success: false, error: "Code de réinitialisation invalide ou expiré." };
    }
    user.password = await this.hashPassword(newPassword);
    if (user.role) {
      user.role = user.role.toLowerCase() as any;
    }
    await user.save();
    await verificationCodeModel.deleteOne({ _id: verificationRecord._id });
    return { success: true, message: "Mot de passe réinitialisé avec succès." };
  }

  async register(registerDto: RegisterDto): Promise<{ success: boolean; message: string; user?: any; error?: string }> {
    const { name, email, password, numtel, date_naissance } = registerDto;
    const existingUser = await this.userModel.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      throw new BadRequestException('Un utilisateur avec cet email existe déjà.');
    }
    const normalizedName = String(name || '').trim() || 'User';
    const username = await generateUniqueUsername(this.userModel, normalizedName);
    const hashedPassword = await this.hashPassword(password);
    const newUser = await this.userModel.create({
      name: normalizedName,
      username,
      email: email.toLowerCase(),
      password: hashedPassword,
      numtel,
      date_naissance,
      role: 'user',
    });
    const userDto = {
      _id: newUser._id.toString(),
      name: newUser.name,
      username: (newUser as any).username,
      email: newUser.email,
      role: newUser.role,
      createdAt: newUser.createdAt,
    };
    return {
      success: true,
      message: 'Utilisateur créé avec succès.',
      user: userDto,
    };
  }

  async registerCreator(registerDto: RegisterDto): Promise<{ success: boolean; message: string; user?: any; error?: string }> {
    const { name, email, password, numtel, date_naissance } = registerDto;
    const existingUser = await this.userModel.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      throw new BadRequestException('Un utilisateur avec cet email existe déjà.');
    }
    const normalizedName = String(name || '').trim() || 'User';
    const username = await generateUniqueUsername(this.userModel, normalizedName);
    const hashedPassword = await this.hashPassword(password);
    const newUser = await this.userModel.create({
      name: normalizedName,
      username,
      email: email.toLowerCase(),
      password: hashedPassword,
      numtel,
      date_naissance,
      role: 'creator',
    });
    const userDto = {
      _id: newUser._id.toString(),
      name: newUser.name,
      username: (newUser as any).username,
      email: newUser.email,
      role: newUser.role,
      createdAt: newUser.createdAt,
    };
    return {
      success: true,
      message: 'Créateur créé avec succès.',
      user: userDto,
    };
  }
}
