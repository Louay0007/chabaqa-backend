import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Request } from 'express';
import { User, UserDocument } from '../../schema/user.schema';
import { Admin, AdminDocument } from '../../schema/admin.schema';
import { TokenBlacklistService } from '../../common/services/token-blacklist.service';
import { getJwtSecret } from '../../common/utils/security-config.util';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Admin.name) private adminModel: Model<AdminDocument>,
    private readonly tokenBlacklistService: TokenBlacklistService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: Request) =>
          req?.cookies?.accessToken
          || req?.cookies?.access_token
          || null,
      ]),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(),
      passReqToCallback: true,
    });
  }

  async validate(_req: Request, payload: any) {
    const tokenId = payload?.jti || `${payload?.sub || 'unknown'}-${payload?.iat || 'unknown'}`;
    const userId = String(payload?.sub || '');
    const isRevoked = await this.tokenBlacklistService.isTokenRevoked(tokenId, userId);
    if (isRevoked) {
      throw new UnauthorizedException('Token révoqué');
    }

    // Check if it's an admin (support both 'admin' and 'super_admin' roles, or any future admin roles)
    if (payload.role === 'admin' || payload.role === 'super_admin' || payload.role === 'moderator') {
      const admin = await this.adminModel.findById(payload.sub);

      if (!admin) {
        // If not found in admin collection, strictly throw unauthorized
        throw new UnauthorizedException('Administrateur non trouvé');
      }

      return {
        _id: admin._id,
        email: admin.email,
        name: admin.name,
        role: admin.role, // Use the actual role from DB
        isAdmin: true,
      };
    } else {
      // Normal user
      const user = await this.userModel.findById(payload.sub);

      if (!user) {
        throw new UnauthorizedException('Utilisateur non trouvé');
      }

      return {
        _id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        isAdmin: false,
      };
    }
  }
}
