import { Module, Global } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { ConfigModule } from '@nestjs/config';
import { CacheService } from '../services/cache.service';

@Global()
@Module({
  imports: [
    NestCacheModule.register({
      ttl: 300, // 5 minutes default TTL
      max: 100, // Maximum number of items in cache
      isGlobal: true,
    }),
  ],
  providers: [CacheService],
  exports: [CacheService, NestCacheModule],
})
export class CacheModule { }
