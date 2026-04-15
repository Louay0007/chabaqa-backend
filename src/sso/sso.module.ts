import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SSOConfig, SSOConfigSchema } from '../schema/sso-config.schema';
import { SSOController } from './sso.controller';
import { SSOService } from './sso.service';
import { CommunityAccessModule } from '../community-access/community-access.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: SSOConfig.name, schema: SSOConfigSchema }]),
    CommunityAccessModule,
  ],
  controllers: [SSOController],
  providers: [SSOService],
  exports: [SSOService],
})
export class SSOModule {}
