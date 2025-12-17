import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { User, UserDocument } from '../schema/user.schema';
import { LoginDto } from '../dto-user/login.dto';
import { LoginResponseDto } from '../dto-user/login-response.dto';
import { EmailService } from '../common/services/email.service';
import { VerificationCodeSchema } from '../schema/verification-code.schema';
import { UserLoginActivityService } from '../user-login-activity/user-login-activity.service';
import { RegisterDto } from '../dto-user/register.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
    private emailService: EmailService,
    private userLoginActivityService: UserLoginActivityService,
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
      const baseName = oauthUser.name || 'Google User';
      const passwordHash = await this.hashPassword(`google:${oauthUser.providerId}:${Date.now()}`);
      let attempt = 0;
      let candidateName = baseName;
      while (await this.userModel.findOne({ name: candidateName })) {
        attempt++;
        candidateName = `${baseName} ${attempt}`;
      }
      user = await this.userModel.create({
        name: candidateName,
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
      email: user.email,
      role: user.role,
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
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken: idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
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

  private generateToken(user: UserDocument): string {
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
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    };

    return {
      accessToken,
      user: userDto
    };
  }

  async getUserById(userId: string): Promise<UserDocument | null> {
    return this.userModel.findById(userId).select('-password').exec();
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
    const hashedPassword = await this.hashPassword(password);
    const newUser = await this.userModel.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      numtel,
      date_naissance,
      role: 'user',
    });
    const userDto = {
      _id: newUser._id.toString(),
      name: newUser.name,
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
    const hashedPassword = await this.hashPassword(password);
    const newUser = await this.userModel.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      numtel,
      date_naissance,
      role: 'creator',
    });
    const userDto = {
      _id: newUser._id.toString(),
      name: newUser.name,
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