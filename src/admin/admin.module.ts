import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { Admin, AdminSchema } from '../schema/admin.schema';
import { VerificationCode, VerificationCodeSchema } from '../schema/verification-code.schema';
import { RevokedToken, RevokedTokenSchema } from '../schema/revoked-token.schema';
import { EmailService } from '../common/services/email.service';
import { TokenBlacklistService } from '../common/services/token-blacklist.service';

/**
 * Module pour la gestion des administrateurs
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Admin.name, schema: AdminSchema },
      { name: VerificationCode.name, schema: VerificationCodeSchema },
      { name: RevokedToken.name, schema: RevokedTokenSchema }
    ]),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'default-secret',
      signOptions: { expiresIn: '1h' },
    }),
    ConfigModule
  ],
  controllers: [AdminController],
  providers: [
    AdminService,
    EmailService,
    TokenBlacklistService
  ],
  exports: [AdminService]
})
export class AdminModule {} 