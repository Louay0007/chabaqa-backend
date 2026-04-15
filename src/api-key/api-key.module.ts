import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ApiKey, ApiKeySchema } from '../schema/api-key.schema';
import { ApiKeyController } from './api-key.controller';
import { ApiKeyService } from './api-key.service';
import { CommunityAccessModule } from '../community-access/community-access.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ApiKey.name, schema: ApiKeySchema }]),
    CommunityAccessModule,
  ],
  controllers: [ApiKeyController],
  providers: [ApiKeyService],
  exports: [ApiKeyService],
})
export class ApiKeyModule {}
