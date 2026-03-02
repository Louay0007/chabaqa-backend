import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { OptionalJwtAuthGuard } from './guards/optional-jwt-auth.guard';
import { User, UserSchema } from '../schema/user.schema';
import { VerificationCode, VerificationCodeSchema } from '../schema/verification-code.schema';
import { Admin, AdminSchema } from '../schema/admin.schema';
import { RevokedToken, RevokedTokenSchema } from '../schema/revoked-token.schema';
import { EmailService } from '../common/services/email.service';
import { TokenBlacklistService } from '../common/services/token-blacklist.service';
import { UserLoginActivityModule } from '../user-login-activity/user-login-activity.module';
import { UploadModule } from '../upload/upload.module';
import { getJwtSecret } from '../common/utils/security-config.util';

@Module({
  imports: [
    PassportModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: VerificationCode.name, schema: VerificationCodeSchema },
      { name: Admin.name, schema: AdminSchema },
      { name: RevokedToken.name, schema: RevokedTokenSchema }
    ]),
    JwtModule.registerAsync({
      global: true,
      useFactory: () => ({
        secret: getJwtSecret(),
        signOptions: { expiresIn: '2h' },
      }),
    }),
    UserLoginActivityModule,
    UploadModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, GoogleStrategy, GoogleAuthGuard, EmailService, TokenBlacklistService, JwtAuthGuard, OptionalJwtAuthGuard],
  exports: [AuthService, TokenBlacklistService, JwtAuthGuard, OptionalJwtAuthGuard],
})
export class AuthModule { } 
