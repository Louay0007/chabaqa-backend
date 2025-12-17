import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../schema/user.schema';
import { Admin, AdminDocument } from '../../schema/admin.schema';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Admin.name) private adminModel: Model<AdminDocument>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'your-secret-key',
    });
  }

  async validate(payload: any) {
    // Check if it's an admin
    if (payload.role === 'admin') {
      const admin = await this.adminModel.findById(payload.sub);

      if (!admin) {
        throw new UnauthorizedException('Administrateur non trouvé');
      }

      return {
        _id: admin._id,
        email: admin.email,
        name: admin.name,
        role: 'admin',
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