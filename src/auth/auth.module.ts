import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { User, UserSchema } from '../schema/user.schema';
import { Admin, AdminSchema } from '../schema/admin.schema';
import { RevokedToken, RevokedTokenSchema } from '../schema/revoked-token.schema';
import { EmailService } from '../common/services/email.service';
import { TokenBlacklistService } from '../common/services/token-blacklist.service';
import { UserLoginActivityModule } from '../user-login-activity/user-login-activity.module';

@Module({
  imports: [
    PassportModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Admin.name, schema: AdminSchema },
      { name: RevokedToken.name, schema: RevokedTokenSchema }
    ]),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'your-secret-key',
      signOptions: { expiresIn: '2h' },
    }),
    UserLoginActivityModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, GoogleStrategy, EmailService, TokenBlacklistService, JwtAuthGuard],
  exports: [AuthService, TokenBlacklistService, JwtAuthGuard],
})
export class AuthModule {} 